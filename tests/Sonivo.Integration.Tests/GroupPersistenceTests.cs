using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Payments;
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
    public async Task Postgres_stripe_billing_allows_restore_from_trash()
    {
        var connectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            _output.WriteLine("SKIPPED: SONIVO_TEST_PG is not configured.");
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(connectionString)
            .AddInterceptors(new BillingWriteInterceptor(new FixedClock(now)))
            .Options;
        await using var db = new SonivoDbContext(options);
        await db.Database.MigrateAsync();
        await using var transaction = await db.Database.BeginTransactionAsync();

        var ownerId = Guid.NewGuid();
        await EnsureBareIdentityUserAsync(db, ownerId);
        var group = Group.Create($"Trash restore {Guid.NewGuid():N}", now);
        var organization = BillingOrganization.Create(ownerId, group.Id, now);
        organization.ApplySubscription("sub_restore_test", PlanCatalog.Pro, "month", "active",
            now.AddMonths(1), null, false, 0, now);
        db.Groups.Add(group);
        db.Memberships.Add(Membership.CreateOwner(group.Id, ownerId, now));
        db.BillingOrganizations.Add(organization);
        db.BillingGroups.Add(new BillingGroup { GroupId = group.Id, OrganizationId = organization.Id });
        await db.SaveChangesAsync();

        group.SoftDelete(group.Version, now.AddSeconds(1));
        await db.SaveChangesAsync();
        group.RestoreFromTrash(group.Version, now.AddDays(1));
        await db.SaveChangesAsync();

        Assert.True(await db.Groups.AnyAsync(x => x.Id == group.Id));
        await transaction.RollbackAsync();
    }

    [Fact]
    public async Task Postgres_stripe_billing_blocks_trash_restore_when_account_is_over_quota()
    {
        var connectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            _output.WriteLine("SKIPPED: SONIVO_TEST_PG is not configured.");
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var ownerId = Guid.NewGuid();
        var activeGroup = Group.Create($"Active {Guid.NewGuid():N}", now);
        var trashedGroup = Group.Create($"Trashed {Guid.NewGuid():N}", now);
        trashedGroup.SoftDelete(trashedGroup.Version, now.AddSeconds(1));
        var organization = BillingOrganization.Create(ownerId, activeGroup.Id, now);
        organization.ApplySubscription($"sub_over_quota_{Guid.NewGuid():N}", PlanCatalog.Starter, "month", "active",
            now.AddMonths(1), null, false, 0, now);

        var seedOptions = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using (var seed = new SonivoDbContext(seedOptions))
        {
            await seed.Database.MigrateAsync();
            await EnsureBareIdentityUserAsync(seed, ownerId);
            seed.Groups.AddRange(activeGroup, trashedGroup);
            seed.Memberships.AddRange(
                Membership.CreateOwner(activeGroup.Id, ownerId, now),
                Membership.CreateOwner(trashedGroup.Id, ownerId, now));
            seed.BillingOrganizations.Add(organization);
            seed.BillingGroups.AddRange(
                new BillingGroup { GroupId = activeGroup.Id, OrganizationId = organization.Id },
                new BillingGroup { GroupId = trashedGroup.Id, OrganizationId = organization.Id });
            await seed.SaveChangesAsync();
        }

        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseNpgsql(connectionString)
            .AddInterceptors(new BillingWriteInterceptor(new FixedClock(now.AddDays(2))))
            .Options;
        await using var db = new SonivoDbContext(options);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var restored = await db.Groups.IgnoreQueryFilters().SingleAsync(x => x.Id == trashedGroup.Id);
        restored.RestoreFromTrash(restored.Version, now.AddDays(2));

        await Assert.ThrowsAsync<ConflictException>(() => db.SaveChangesAsync());
        await transaction.RollbackAsync();
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

    private sealed class FixedClock(DateTimeOffset utcNow) : Sonivo.Application.Abstractions.IClock
    {
        public DateTimeOffset UtcNow { get; } = utcNow;
    }
}
