using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Persistence;
using Xunit.Abstractions;

namespace Sonivo.Integration.Tests;

public class SoftDeleteSongCascadeTests
{
    private readonly ITestOutputHelper _output;

    public SoftDeleteSongCascadeTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task InMemory_cascade_soft_deletes_live_arrangements_preserves_resources_and_skips_already_deleted()
    {
        await using var db = CreateInMemoryDb();
        var (owner, groupId, songId, liveId, deletedId, resourceId) = await SeedCascadeScenarioAsync(db);

        var groups = new EfGroupStore(db);
        var songs = new EfSongStore(db);
        var arrangements = new EfArrangementStore(db);
        var access = new GroupAccessService(groups);
        var clock = new SystemClock();

        var deletedBefore = await db.Arrangements.IgnoreQueryFilters().SingleAsync(a => a.Id == deletedId);
        var deletedVersionBefore = deletedBefore.Version;
        var deletedAtBefore = deletedBefore.DeletedAt;

        await new SoftDeleteSongHandler(access, songs, arrangements, new EfUnitOfWork(db), clock)
            .HandleAsync(new SoftDeleteSongCommand(owner, groupId, songId, 1), CancellationToken.None);

        Assert.Null(await db.Songs.FirstOrDefaultAsync(s => s.Id == songId));
        var song = await db.Songs.IgnoreQueryFilters().SingleAsync(s => s.Id == songId);
        Assert.NotNull(song.DeletedAt);
        Assert.Equal(2, song.Version);

        Assert.Null(await db.Arrangements.FirstOrDefaultAsync(a => a.Id == liveId));
        var live = await db.Arrangements.IgnoreQueryFilters().SingleAsync(a => a.Id == liveId);
        Assert.NotNull(live.DeletedAt);
        Assert.Equal(2, live.Version);

        var stillDeleted = await db.Arrangements.IgnoreQueryFilters().SingleAsync(a => a.Id == deletedId);
        Assert.Equal(deletedVersionBefore, stillDeleted.Version);
        Assert.Equal(deletedAtBefore, stillDeleted.DeletedAt);

        Assert.NotNull(await db.Resources.SingleAsync(r => r.Id == resourceId));
    }

    [Fact]
    public async Task InMemory_stale_song_version_writes_nothing()
    {
        await using var db = CreateInMemoryDb();
        var (owner, groupId, songId, liveId, _, _) = await SeedCascadeScenarioAsync(db);
        var groups = new EfGroupStore(db);
        var songs = new EfSongStore(db);
        var arrangements = new EfArrangementStore(db);

        await Assert.ThrowsAsync<Application.Abstractions.ConflictException>(() =>
            new SoftDeleteSongHandler(new GroupAccessService(groups), songs, arrangements, new EfUnitOfWork(db), new SystemClock())
                .HandleAsync(new SoftDeleteSongCommand(owner, groupId, songId, 99), CancellationToken.None));

        Assert.NotNull(await db.Songs.SingleAsync(s => s.Id == songId));
        Assert.NotNull(await db.Arrangements.SingleAsync(a => a.Id == liveId));
    }

    [Fact]
    public async Task Postgres_arrangement_concurrency_conflict_rolls_back_song_and_cascade()
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
        var unitOfWork = new EfUnitOfWork(db);
        var access = new GroupAccessService(groups);
        var clock = new SystemClock();

        var group = await new CreateGroupHandler(groups, clock)
            .HandleAsync(new CreateGroupCommand(owner, $"Race {Guid.NewGuid():N}"), CancellationToken.None);
        var song = await new CreateSongHandler(access, songs, clock)
            .HandleAsync(
                new CreateSongCommand(owner, group.Id, "Race Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);
        var live = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    owner, group.Id, song.Id, "Live", null, null, null, null, null, null),
                CancellationToken.None);

        var resourceId = Guid.NewGuid();
        db.Resources.Add(Resource.CreateLink(
            live.Id,
            ResourcePurposes.Practice,
            "Chart",
            "https://example.com/race",
            DateTimeOffset.UtcNow,
            id: resourceId));
        await db.SaveChangesAsync();

        // Load tracked entities for cascade, then mutate Arrangement concurrently.
        var trackedSong = await songs.GetByIdAsync(group.Id, song.Id, CancellationToken.None);
        Assert.NotNull(trackedSong);
        var trackedLive = await arrangements.ListLiveTrackedBySongAsync(group.Id, song.Id, CancellationToken.None);
        var now = DateTimeOffset.UtcNow;
        trackedSong.SoftDelete(song.Version, now);
        foreach (var arrangement in trackedLive)
        {
            arrangement.SoftDelete(arrangement.Version, now);
        }

        await using (var db2 = new SonivoDbContext(options))
        {
            var concurrent = await db2.Arrangements.SingleAsync(a => a.Id == live.Id);
            concurrent.Update("Concurrent edit", null, 120, null, null, null, null, concurrent.Version, now.AddSeconds(1));
            await db2.SaveChangesAsync();
        }

        await songs.UpdateAsync(trackedSong, CancellationToken.None);
        foreach (var arrangement in trackedLive)
        {
            await arrangements.UpdateAsync(arrangement, CancellationToken.None);
        }

        await Assert.ThrowsAsync<Application.Abstractions.ConflictException>(() =>
            unitOfWork.SaveChangesAsync(CancellationToken.None));

        Assert.NotNull(await db.Songs.SingleAsync(s => s.Id == song.Id && s.DeletedAt == null));
        var arrAfter = await db.Arrangements.SingleAsync(a => a.Id == live.Id && a.DeletedAt == null);
        Assert.Equal("Concurrent edit", arrAfter.Label);
        Assert.Equal(2, arrAfter.Version);
        Assert.NotNull(await db.Resources.SingleAsync(r => r.Id == resourceId));
        _output.WriteLine("PostgreSQL cascade concurrency rollback executed successfully.");
    }

    [Fact]
    public async Task Postgres_cascade_when_available()
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
        var access = new GroupAccessService(groups);
        var clock = new SystemClock();

        var group = await new CreateGroupHandler(groups, clock)
            .HandleAsync(new CreateGroupCommand(owner, $"Cascade {Guid.NewGuid():N}"), CancellationToken.None);
        var song = await new CreateSongHandler(access, songs, clock)
            .HandleAsync(
                new CreateSongCommand(owner, group.Id, "PG Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);
        var live = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    owner, group.Id, song.Id, "Live", null, null, null, null, null, null),
                CancellationToken.None);
        var prior = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    owner, group.Id, song.Id, "Prior", null, null, null, null, null, null),
                CancellationToken.None);
        await new SoftDeleteArrangementHandler(access, arrangements, clock)
            .HandleAsync(
                new SoftDeleteArrangementCommand(owner, group.Id, prior.Id, prior.Version),
                CancellationToken.None);

        var resourceId = Guid.NewGuid();
        db.Resources.Add(Resource.CreateLink(
            live.Id,
            ResourcePurposes.Reference,
            "Link",
            "https://example.com/pg",
            DateTimeOffset.UtcNow,
            id: resourceId));
        await db.SaveChangesAsync();

        var priorRow = await db.Arrangements.IgnoreQueryFilters().SingleAsync(a => a.Id == prior.Id);
        var priorVersion = priorRow.Version;
        var priorDeletedAt = priorRow.DeletedAt;

        await new SoftDeleteSongHandler(access, songs, arrangements, new EfUnitOfWork(db), clock)
            .HandleAsync(new SoftDeleteSongCommand(owner, group.Id, song.Id, song.Version), CancellationToken.None);

        Assert.Null(await db.Songs.FirstOrDefaultAsync(s => s.Id == song.Id));
        Assert.Equal(2, (await db.Songs.IgnoreQueryFilters().SingleAsync(s => s.Id == song.Id)).Version);
        Assert.Null(await db.Arrangements.FirstOrDefaultAsync(a => a.Id == live.Id));
        Assert.Equal(2, (await db.Arrangements.IgnoreQueryFilters().SingleAsync(a => a.Id == live.Id)).Version);

        var priorAfter = await db.Arrangements.IgnoreQueryFilters().SingleAsync(a => a.Id == prior.Id);
        Assert.Equal(priorVersion, priorAfter.Version);
        Assert.Equal(priorDeletedAt, priorAfter.DeletedAt);
        Assert.NotNull(await db.Resources.SingleAsync(r => r.Id == resourceId));
        _output.WriteLine("PostgreSQL Song cascade executed successfully.");
    }

    private static async Task<(Guid Owner, Guid GroupId, Guid SongId, Guid LiveId, Guid DeletedId, Guid ResourceId)>
        SeedCascadeScenarioAsync(SonivoDbContext db)
    {
        var groups = new EfGroupStore(db);
        var songs = new EfSongStore(db);
        var arrangements = new EfArrangementStore(db);
        var access = new GroupAccessService(groups);
        var clock = new FixedClock(DateTimeOffset.Parse("2026-09-15T15:00:00Z"));
        var owner = Guid.NewGuid();

        var group = await new CreateGroupHandler(groups, clock)
            .HandleAsync(new CreateGroupCommand(owner, "Cascade Band"), CancellationToken.None);
        var song = await new CreateSongHandler(access, songs, clock)
            .HandleAsync(
                new CreateSongCommand(owner, group.Id, "Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);
        var live = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    owner, group.Id, song.Id, "Live", null, null, null, null, null, null),
                CancellationToken.None);
        var prior = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    owner, group.Id, song.Id, "Prior", null, null, null, null, null, null),
                CancellationToken.None);
        await new SoftDeleteArrangementHandler(access, arrangements, clock)
            .HandleAsync(
                new SoftDeleteArrangementCommand(owner, group.Id, prior.Id, prior.Version),
                CancellationToken.None);

        var resourceId = Guid.NewGuid();
        db.Resources.Add(Resource.CreateLink(
            live.Id,
            ResourcePurposes.Practice,
            "Chart",
            "https://example.com/chart",
            clock.UtcNow,
            id: resourceId));
        await db.SaveChangesAsync();

        return (owner, group.Id, song.Id, live.Id, prior.Id, resourceId);
    }

    private static SonivoDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-song-cascade-{Guid.NewGuid()}")
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

    private sealed class FixedClock(DateTimeOffset now) : Application.Abstractions.IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }
}
