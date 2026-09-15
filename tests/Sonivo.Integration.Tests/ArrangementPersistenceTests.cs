using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

public class ArrangementPersistenceTests
{
    [Fact]
    public async Task Soft_delete_excludes_arrangement_and_preserves_resources()
    {
        await using var db = CreateInMemoryDb();
        var groups = new EfGroupStore(db);
        var songs = new EfSongStore(db);
        var arrangements = new EfArrangementStore(db);
        var clock = new SystemClock();
        var access = new GroupAccessService(groups);
        var owner = Guid.NewGuid();

        var group = await new CreateGroupHandler(groups, clock)
            .HandleAsync(new CreateGroupCommand(owner, "Arr Persist"), CancellationToken.None);
        var song = await new CreateSongHandler(access, songs, clock)
            .HandleAsync(
                new CreateSongCommand(owner, group.Id, "Song", null, SongOriginKinds.Original, null),
                CancellationToken.None);
        var arr = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    owner, group.Id, song.Id, "Acoustic", "G", 100, null, null, null, null),
                CancellationToken.None);

        var resourceId = Guid.NewGuid();
        db.Resources.Add(Resource.CreateLink(
            arr.Id,
            ResourcePurposes.Practice,
            "Link chart",
            "https://example.com/a",
            DateTimeOffset.UtcNow,
            id: resourceId));
        await db.SaveChangesAsync();

        await new SoftDeleteArrangementHandler(access, arrangements, clock)
            .HandleAsync(
                new SoftDeleteArrangementCommand(owner, group.Id, arr.Id, arr.Version),
                CancellationToken.None);

        Assert.Null(await db.Arrangements.FirstOrDefaultAsync(a => a.Id == arr.Id));
        var deleted = await db.Arrangements.IgnoreQueryFilters().SingleAsync(a => a.Id == arr.Id);
        Assert.NotNull(deleted.DeletedAt);
        Assert.Equal(arr.Version + 1, deleted.Version);

        Assert.NotNull(await db.Resources.SingleAsync(r => r.Id == resourceId));
    }

    [Fact]
    public async Task Tenant_isolation_prevents_cross_group_arrangement_lookup()
    {
        await using var db = CreateInMemoryDb();
        var groups = new EfGroupStore(db);
        var songs = new EfSongStore(db);
        var arrangements = new EfArrangementStore(db);
        var clock = new SystemClock();
        var access = new GroupAccessService(groups);

        var ownerA = Guid.NewGuid();
        var ownerB = Guid.NewGuid();
        var groupA = await new CreateGroupHandler(groups, clock)
            .HandleAsync(new CreateGroupCommand(ownerA, "A"), CancellationToken.None);
        var groupB = await new CreateGroupHandler(groups, clock)
            .HandleAsync(new CreateGroupCommand(ownerB, "B"), CancellationToken.None);
        var songA = await new CreateSongHandler(access, songs, clock)
            .HandleAsync(
                new CreateSongCommand(ownerA, groupA.Id, "Song A", null, SongOriginKinds.Original, null),
                CancellationToken.None);
        var arr = await new CreateArrangementHandler(access, songs, arrangements, clock)
            .HandleAsync(
                new CreateArrangementCommand(
                    ownerA, groupA.Id, songA.Id, "Live", null, null, null, null, null, null),
                CancellationToken.None);

        Assert.Null(await arrangements.GetByIdAsync(groupB.Id, arr.Id, CancellationToken.None));
    }

    private static SonivoDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-arr-{Guid.NewGuid()}")
            .Options;
        return new SonivoDbContext(options);
    }
}
