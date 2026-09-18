using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Persistence;
using Xunit.Abstractions;

namespace Sonivo.Integration.Tests;

public class LinkResourcePersistenceTests
{
    private readonly ITestOutputHelper _output;

    public LinkResourcePersistenceTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task InMemory_link_resource_persists_with_null_file_columns_and_hard_deletes()
    {
        await using var db = CreateInMemoryDb();
        var (owner, groupId, arrangementId, _) = await SeedAsync(db);
        var access = new GroupAccessService(new EfGroupStore(db));
        var arrangements = new EfArrangementStore(db);
        var resources = new EfResourceStore(db);
        var clock = new SystemClock();

        var created = await new CreateLinkResourceHandler(access, arrangements, resources, clock)
            .HandleAsync(
                new CreateLinkResourceCommand(
                    owner, groupId, arrangementId, ResourceKinds.Link,
                    ResourcePurposes.Practice, "Chart", "Gtr", null, "https://example.com/c"),
                CancellationToken.None);

        var row = await db.Resources.SingleAsync(r => r.Id == created.Id);
        Assert.Equal(ResourceKinds.Link, row.Kind);
        Assert.Equal("https://example.com/c", row.Url);
        Assert.Null(row.ObjectKey);
        Assert.Null(row.ContentType);
        Assert.Null(row.ByteSize);
        Assert.Null(row.OriginalFileName);

        var second = await new CreateLinkResourceHandler(access, arrangements, resources, clock)
            .HandleAsync(
                new CreateLinkResourceCommand(
                    owner, groupId, arrangementId, ResourceKinds.Link,
                    ResourcePurposes.Audio, "Track", null, null, "https://example.com/a"),
                CancellationToken.None);
        Assert.Equal(2, await db.Resources.CountAsync(r => r.ArrangementId == arrangementId));

        var arrVersion = (await db.Arrangements.SingleAsync(a => a.Id == arrangementId)).Version;
        await new DeleteResourceHandler(
                access, arrangements, resources, new PostgresBlobStore(db, clock),
                NullLogger<DeleteResourceHandler>.Instance)
            .HandleAsync(owner, groupId, arrangementId, created.Id, CancellationToken.None);

        Assert.Null(await db.Resources.FirstOrDefaultAsync(r => r.Id == created.Id));
        Assert.NotNull(await db.Resources.SingleAsync(r => r.Id == second.Id));
        Assert.Equal(arrVersion, (await db.Arrangements.SingleAsync(a => a.Id == arrangementId)).Version);
    }

    [Fact]
    public async Task InMemory_resources_survive_arrangement_soft_delete_but_api_returns_not_found()
    {
        await using var db = CreateInMemoryDb();
        var (owner, groupId, arrangementId, _) = await SeedAsync(db);
        var access = new GroupAccessService(new EfGroupStore(db));
        var arrangements = new EfArrangementStore(db);
        var resources = new EfResourceStore(db);
        var clock = new SystemClock();

        var created = await new CreateLinkResourceHandler(access, arrangements, resources, clock)
            .HandleAsync(
                new CreateLinkResourceCommand(
                    owner, groupId, arrangementId, ResourceKinds.Link,
                    ResourcePurposes.Other, "L", null, null, "https://example.com"),
                CancellationToken.None);

        await new SoftDeleteArrangementHandler(access, arrangements, clock)
            .HandleAsync(new SoftDeleteArrangementCommand(owner, groupId, arrangementId, 1), CancellationToken.None);

        Assert.NotNull(await db.Resources.SingleAsync(r => r.Id == created.Id));
        await Assert.ThrowsAsync<Application.Abstractions.NotFoundException>(() =>
            new ListResourcesHandler(access, arrangements, resources)
                .HandleAsync(owner, groupId, arrangementId, CancellationToken.None));
    }

    [Fact]
    public async Task Postgres_link_resource_when_available()
    {
        if (!TryCreatePostgresOptions(out var options, out var skip))
        {
            _output.WriteLine($"SKIPPED: {skip}");
            return;
        }

        await using var db = new SonivoDbContext(options);
        await db.Database.MigrateAsync();
        var owner = Guid.NewGuid();
        await EnsureBareIdentityUserAsync(db, owner);

        var groups = new EfGroupStore(db);
        var songs = new EfSongStore(db);
        var arrangements = new EfArrangementStore(db);
        var resources = new EfResourceStore(db);
        var access = new GroupAccessService(groups);
        var clock = new SystemClock();

        var group = await new CreateGroupHandler(groups, clock)
            .HandleAsync(new CreateGroupCommand(owner, $"Res {Guid.NewGuid():N}"), CancellationToken.None);
        var song = await new CreateSongHandler(access, songs, clock)
            .HandleAsync(
                new CreateSongCommand(owner, group.Id, "Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);
        var arr = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    owner, group.Id, song.Id, "Arr", null, null, null, null, null, null),
                CancellationToken.None);

        var created = await new CreateLinkResourceHandler(access, arrangements, resources, clock)
            .HandleAsync(
                new CreateLinkResourceCommand(
                    owner, group.Id, arr.Id, ResourceKinds.Link,
                    ResourcePurposes.Chart, "PDF", null, null, "https://example.com/pg"),
                CancellationToken.None);

        var row = await db.Resources.AsNoTracking().SingleAsync(r => r.Id == created.Id);
        Assert.Equal(ResourceKinds.Link, row.Kind);
        Assert.Null(row.ObjectKey);
        _output.WriteLine("PostgreSQL link Resource persistence executed successfully.");
    }

    private static async Task<(Guid Owner, Guid GroupId, Guid ArrangementId, Guid SongId)> SeedAsync(SonivoDbContext db)
    {
        var groups = new EfGroupStore(db);
        var songs = new EfSongStore(db);
        var arrangements = new EfArrangementStore(db);
        var access = new GroupAccessService(groups);
        var clock = new SystemClock();
        var owner = Guid.NewGuid();

        var group = await new CreateGroupHandler(groups, clock)
            .HandleAsync(new CreateGroupCommand(owner, "Res Band"), CancellationToken.None);
        var song = await new CreateSongHandler(access, songs, clock)
            .HandleAsync(
                new CreateSongCommand(owner, group.Id, "Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);
        var arr = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    owner, group.Id, song.Id, "Acoustic", null, null, null, null, null, null),
                CancellationToken.None);
        return (owner, group.Id, arr.Id, song.Id);
    }

    private static SonivoDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-res-{Guid.NewGuid()}")
            .Options;
        return new SonivoDbContext(options);
    }

    private static bool TryCreatePostgresOptions(out DbContextOptions<SonivoDbContext> options, out string? skipReason)
    {
        var cs = Environment.GetEnvironmentVariable("SONIVO_TEST_PG")
            ?? "Host=localhost;Port=5433;Database=sonivo_test;Username=sonivo;Password=sonivo";
        try
        {
            options = new DbContextOptionsBuilder<SonivoDbContext>().UseNpgsql(cs).Options;
            using var probe = new SonivoDbContext(options);
            if (!probe.Database.CanConnect())
            {
                skipReason = "PostgreSQL unavailable.";
                return false;
            }

            skipReason = null;
            return true;
        }
        catch (Exception ex)
        {
            options = null!;
            skipReason = ex.Message;
            return false;
        }
    }

    private static async Task EnsureBareIdentityUserAsync(SonivoDbContext db, Guid userId)
    {
        var email = $"{userId:N}@test.local";
        var normalized = email.ToUpperInvariant();
        await db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO ""AspNetUsers"" (""Id"", ""UserName"", ""NormalizedUserName"", ""Email"", ""NormalizedEmail"", ""EmailConfirmed"", ""PasswordHash"", ""SecurityStamp"", ""ConcurrencyStamp"", ""PhoneNumberConfirmed"", ""TwoFactorEnabled"", ""LockoutEnabled"", ""AccessFailedCount"", ""DisplayName"")
VALUES ({userId}, {email}, {normalized}, {email}, {normalized}, TRUE, 'x', 'stamp', 'conc', FALSE, FALSE, FALSE, 0, 'Test')
ON CONFLICT (""Id"") DO NOTHING;");
    }
}
