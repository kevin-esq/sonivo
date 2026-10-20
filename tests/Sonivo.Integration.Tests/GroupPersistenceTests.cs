using Microsoft.EntityFrameworkCore;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Persistence;
using Xunit.Abstractions;

namespace Sonivo.Integration.Tests;

[Collection(PostgresMigrationCollection.Name)]
public class GroupPersistenceTests
{
    private readonly ITestOutputHelper _output;

    public GroupPersistenceTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task InMemory_create_group_persists_owner_membership()
    {
        await using var db = CreateInMemoryDb();
        var store = new EfGroupStore(db);
        var userId = Guid.NewGuid();

        var created = await new CreateGroupHandler(store, new SystemClock())
            .HandleAsync(new CreateGroupCommand(userId, "InMemory Band"), CancellationToken.None);

        var membership = await db.Memberships.SingleAsync(m => m.GroupId == created.Id);
        Assert.Equal(MembershipRoles.Owner, membership.Role);
        Assert.Equal(userId, membership.UserId);
        Assert.Equal(1, (await db.Groups.SingleAsync(g => g.Id == created.Id)).Version);
    }

    [Fact]
    public async Task InMemory_soft_delete_excludes_group_from_normal_queries()
    {
        await using var db = CreateInMemoryDb();
        var store = new EfGroupStore(db);
        var clock = new SystemClock();
        var access = new GroupAccessService(store);
        var userId = Guid.NewGuid();

        var created = await new CreateGroupHandler(store, clock)
            .HandleAsync(new CreateGroupCommand(userId, "Temp Band"), CancellationToken.None);

        await new SoftDeleteGroupHandler(access, store, clock)
            .HandleAsync(new SoftDeleteGroupCommand(userId, created.Id, created.Version), CancellationToken.None);

        Assert.Null(await db.Groups.FirstOrDefaultAsync(g => g.Id == created.Id));
        Assert.NotNull(await db.Groups.IgnoreQueryFilters().FirstOrDefaultAsync(g => g.Id == created.Id));
    }

    [Fact]
    public async Task InMemory_membership_store_checks_only_other_group_memberships()
    {
        await using var db = CreateInMemoryDb();
        var store = new EfMembershipStore(db);
        var currentGroupId = Guid.NewGuid();
        var otherGroupId = Guid.NewGuid();
        var targetUserId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        db.Memberships.AddRange(
            Membership.CreateMember(currentGroupId, targetUserId, now),
            Membership.CreateMember(otherGroupId, targetUserId, now));
        await db.SaveChangesAsync();

        Assert.True(await store.HasMembershipInOtherGroupAsync(
            targetUserId,
            currentGroupId,
            CancellationToken.None));
        Assert.True(await store.HasMembershipInOtherGroupAsync(
            targetUserId,
            otherGroupId,
            CancellationToken.None));
        Assert.False(await store.HasMembershipInOtherGroupAsync(
            Guid.NewGuid(),
            currentGroupId,
            CancellationToken.None));
    }

    [Fact]
    public async Task Postgres_create_and_soft_delete_when_available()
    {
        if (!TryCreatePostgresOptions(out var options, out var skip))
        {
            _output.WriteLine($"SKIPPED: {skip}");
            return;
        }

        await using var db = new SonivoDbContext(options);
        await db.Database.MigrateAsync();

        var userId = Guid.NewGuid();
        await EnsureBareIdentityUserAsync(db, userId);

        var store = new EfGroupStore(db);
        var clock = new SystemClock();
        var access = new GroupAccessService(store);

        var created = await new CreateGroupHandler(store, clock)
            .HandleAsync(new CreateGroupCommand(userId, $"PG Band {Guid.NewGuid():N}"), CancellationToken.None);

        Assert.Equal(
            MembershipRoles.Owner,
            (await db.Memberships.AsNoTracking().SingleAsync(m => m.GroupId == created.Id)).Role);

        await new SoftDeleteGroupHandler(access, store, clock)
            .HandleAsync(new SoftDeleteGroupCommand(userId, created.Id, created.Version), CancellationToken.None);

        Assert.Null(await db.Groups.FirstOrDefaultAsync(g => g.Id == created.Id));
        Assert.NotNull(await db.Groups.IgnoreQueryFilters().FirstOrDefaultAsync(g => g.Id == created.Id));
        _output.WriteLine("PostgreSQL integration executed successfully.");
    }

    [Fact]
    public async Task Postgres_rejects_membership_assignment_to_a_role_from_another_group()
    {
        if (!TryCreatePostgresOptions(out var options, out var skip))
        {
            _output.WriteLine($"SKIPPED: {skip}");
            return;
        }

        await using var db = new SonivoDbContext(options);
        await db.Database.MigrateAsync();
        await using var transaction = await db.Database.BeginTransactionAsync();

        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        await EnsureBareIdentityUserAsync(db, ownerId);
        await EnsureBareIdentityUserAsync(db, memberId);

        var now = DateTimeOffset.UtcNow;
        var memberGroupId = Guid.NewGuid();
        var roleGroupId = Guid.NewGuid();
        var memberGroup = Group.Create(
            $"Member group {memberGroupId:N}", now, memberGroupId, $"member-{memberGroupId:N}");
        var roleGroup = Group.Create(
            $"Role group {roleGroupId:N}", now, roleGroupId, $"role-{roleGroupId:N}");
        db.Groups.AddRange(memberGroup, roleGroup);
        db.Memberships.AddRange(
            Membership.CreateOwner(memberGroupId, ownerId, now),
            Membership.CreateOwner(roleGroupId, ownerId, now));
        await db.SaveChangesAsync();

        var foreignRole = GroupRole.Create(roleGroupId, "Foreign role", now, Array.Empty<string>());
        db.GroupRoles.Add(foreignRole);
        await db.SaveChangesAsync();

        var membership = Membership.CreateMember(memberGroupId, memberId, now);
        db.Memberships.Add(membership);
        await db.SaveChangesAsync();

        membership.AssignGroupRole(foreignRole.Id);
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains(
            "FK_Memberships_GroupRoles_GroupId_GroupRoleId",
            exception.InnerException?.Message ?? exception.Message,
            StringComparison.Ordinal);

        await transaction.RollbackAsync();
    }

    [Fact]
    public async Task Postgres_rejects_setlist_item_owned_by_another_group()
    {
        if (!TryCreatePostgresOptions(out var options, out var skip))
        {
            _output.WriteLine($"SKIPPED: {skip}");
            return;
        }

        await using var db = new SonivoDbContext(options);
        await db.Database.MigrateAsync();
        await using var transaction = await db.Database.BeginTransactionAsync();

        var now = DateTimeOffset.UtcNow;
        var setlistGroupId = Guid.NewGuid();
        var itemGroupId = Guid.NewGuid();
        var setlistGroup = Group.Create(
            $"Setlist group {setlistGroupId:N}", now, setlistGroupId, $"setlist-{setlistGroupId:N}");
        var itemGroup = Group.Create(
            $"Item group {itemGroupId:N}", now, itemGroupId, $"item-{itemGroupId:N}");
        var song = Song.Create(itemGroupId, "Foreign song", SongOriginKinds.Original, now);
        var arrangement = Arrangement.Create(itemGroupId, song.Id, "Original", now);
        var setlist = Setlist.Create(setlistGroupId, "Target setlist", now);
        db.Groups.AddRange(setlistGroup, itemGroup);
        db.Songs.Add(song);
        db.Arrangements.Add(arrangement);
        db.Setlists.Add(setlist);
        await db.SaveChangesAsync();

        db.SetlistItems.Add(SetlistItem.Create(setlist.Id, itemGroupId, arrangement.Id, 0));
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Contains(
            "FK_SetlistItems_Setlists_GroupId_SetlistId",
            exception.InnerException?.Message ?? exception.Message,
            StringComparison.Ordinal);

        await transaction.RollbackAsync();
    }

    private static SonivoDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-group-{Guid.NewGuid()}")
            .Options;
        return new SonivoDbContext(options);
    }

    private static bool TryCreatePostgresOptions(out DbContextOptions<SonivoDbContext> options, out string? skipReason)
    {
        var cs = Environment.GetEnvironmentVariable("SONIVO_TEST_PG")
            ?? "Host=localhost;Port=5433;Database=sonivo_test;Username=sonivo;Password=sonivo";

        try
        {
            options = new DbContextOptionsBuilder<SonivoDbContext>()
                .UseNpgsql(cs)
                .Options;

            using var probe = new SonivoDbContext(options);
            if (!probe.Database.CanConnect())
            {
                skipReason = "PostgreSQL unavailable: CanConnect returned false.";
                return false;
            }

            skipReason = null;
            return true;
        }
        catch (Exception ex)
        {
            options = null!;
            skipReason = $"PostgreSQL unavailable: {ex.Message}";
            return false;
        }
    }

    private static async Task EnsureBareIdentityUserAsync(SonivoDbContext db, Guid userId)
    {
        var email = $"{userId:N}@test.local";
        var normalized = email.ToUpperInvariant();
        var displayName = "Test";
        await db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO ""AspNetUsers"" (""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"", ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"", ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"", ""DisplayName"")
VALUES ({userId}, {email}, {normalized}, {email}, {normalized}, TRUE, 'x', 'stamp', 'conc', FALSE, FALSE, FALSE, 0, {displayName})
ON CONFLICT (""Id"") DO NOTHING;");
    }
}
