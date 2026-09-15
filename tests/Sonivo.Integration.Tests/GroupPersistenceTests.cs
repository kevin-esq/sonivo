using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Persistence;
using Xunit.Abstractions;

namespace Sonivo.Integration.Tests;

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
