using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Integration.Tests;

public class ApplySetlistPersistenceTests
{
    [Fact]
    public async Task InMemory_apply_replaces_plan_in_one_unit_of_work()
    {
        await using var db = CreateInMemoryDb();
        var now = DateTimeOffset.Parse("2026-09-16T15:00:00Z");
        var owner = Guid.NewGuid();
        var group = Group.Create("Apply Band", now);
        await db.Groups.AddAsync(group);
        await db.Memberships.AddAsync(Membership.CreateOwner(group.Id, owner, now));

        var song = Song.Create(group.Id, "Grace", SongOriginKinds.Original, now);
        var arrA = Arrangement.Create(group.Id, song.Id, "Acoustic", now);
        var arrB = Arrangement.Create(group.Id, song.Id, "Full Band", now);
        await db.Songs.AddAsync(song);
        await db.Arrangements.AddAsync(arrA);
        await db.Arrangements.AddAsync(arrB);

        var setlist = Setlist.Create(group.Id, "Sunday", now);
        setlist.Items.Add(SetlistItem.Create(setlist.Id, group.Id, arrA.Id, 1));
        setlist.Items.Add(SetlistItem.Create(setlist.Id, group.Id, arrB.Id, 2));
        await db.Setlists.AddAsync(setlist);

        var musicalEvent = Event.Create(
            group.Id,
            "Friday",
            EventTypes.Rehearsal,
            now.AddDays(2),
            now);
        await db.Events.AddAsync(musicalEvent);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var groups = new EfGroupStore(db);
        var events = new EfEventStore(db);
        var setlists = new EfSetlistStore(db);
        var arrangements = new EfArrangementStore(db);
        var songs = new EfSongStore(db);
        var unitOfWork = new EfUnitOfWork(db);
        var access = new GroupAccessService(groups);
        var clock = new FixedClock(now.AddHours(1));

        var detail = await new ReplaceEventPlanFromSetlistHandler(
                access, events, setlists, arrangements, songs, unitOfWork, clock)
            .HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    owner, group.Id, musicalEvent.Id, setlist.Id, 1, false),
                CancellationToken.None);

        Assert.Equal(2, detail.Version);
        Assert.Equal(setlist.Id, detail.SourceSetlistId);
        Assert.Equal(2, detail.Items.Count);
        Assert.Equal("Grace", detail.Items[0].DisplaySongTitle);
        Assert.Equal("Acoustic", detail.Items[0].DisplayArrangementLabel);

        db.ChangeTracker.Clear();
        var reloaded = await db.Events.Include(e => e.Items).SingleAsync(e => e.Id == musicalEvent.Id);
        Assert.Equal(2, reloaded.Version);
        Assert.Equal(2, reloaded.Items.Count);
        Assert.All(reloaded.Items, i => Assert.False(string.IsNullOrWhiteSpace(i.DisplaySongTitle)));

        // Second apply with confirmReplace after template reorder via store APIs
        var setlistsStore = new EfSetlistStore(db);
        var trackedSetlist = await setlistsStore.GetByIdWithItemsAsync(group.Id, setlist.Id, CancellationToken.None);
        Assert.NotNull(trackedSetlist);
        trackedSetlist.BeginReplaceItems(trackedSetlist.Version, now.AddHours(2));
        var oldItems = trackedSetlist.Items.ToList();
        await setlistsStore.RemoveItemsAsync(oldItems, CancellationToken.None);
        trackedSetlist.Items.Clear();
        var onlyB = SetlistItem.Create(setlist.Id, group.Id, arrB.Id, 1);
        trackedSetlist.Items.Add(onlyB);
        await setlistsStore.AddItemsAsync([onlyB], CancellationToken.None);
        await setlistsStore.UpdateAsync(trackedSetlist, CancellationToken.None);
        await unitOfWork.SaveChangesAsync(CancellationToken.None);
        db.ChangeTracker.Clear();

        var replaced = await new ReplaceEventPlanFromSetlistHandler(
                access, events, setlists, arrangements, songs, unitOfWork, clock)
            .HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    owner, group.Id, musicalEvent.Id, setlist.Id, 2, true),
                CancellationToken.None);

        Assert.Equal(3, replaced.Version);
        Assert.Single(replaced.Items);
        Assert.Equal(arrB.Id, replaced.Items[0].ArrangementId);
        Assert.Equal("Full Band", replaced.Items[0].DisplayArrangementLabel);

        db.ChangeTracker.Clear();
        Assert.Equal(1, await db.EventSetlistItems.CountAsync(i => i.EventId == musicalEvent.Id));
    }

    [Fact]
    public async Task InMemory_stale_version_writes_nothing()
    {
        await using var db = CreateInMemoryDb();
        var now = DateTimeOffset.UtcNow;
        var owner = Guid.NewGuid();
        var group = Group.Create("Stale", now);
        await db.Groups.AddAsync(group);
        await db.Memberships.AddAsync(Membership.CreateOwner(group.Id, owner, now));
        var song = Song.Create(group.Id, "S", SongOriginKinds.Original, now);
        var arr = Arrangement.Create(group.Id, song.Id, "A", now);
        await db.Songs.AddAsync(song);
        await db.Arrangements.AddAsync(arr);
        var setlist = Setlist.Create(group.Id, "T", now);
        setlist.Items.Add(SetlistItem.Create(setlist.Id, group.Id, arr.Id, 1));
        await db.Setlists.AddAsync(setlist);
        var musicalEvent = Event.Create(group.Id, "E", EventTypes.Other, now.AddDays(1), now);
        await db.Events.AddAsync(musicalEvent);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        await Assert.ThrowsAsync<ConflictException>(() =>
            new ReplaceEventPlanFromSetlistHandler(
                    new GroupAccessService(new EfGroupStore(db)),
                    new EfEventStore(db),
                    new EfSetlistStore(db),
                    new EfArrangementStore(db),
                    new EfSongStore(db),
                    new EfUnitOfWork(db),
                    new SystemClock())
                .HandleAsync(
                    new ReplaceEventPlanFromSetlistCommand(
                        owner, group.Id, musicalEvent.Id, setlist.Id, 99, false),
                    CancellationToken.None));

        Assert.Equal(0, await db.EventSetlistItems.CountAsync());
        Assert.Equal(1, await db.Events.Where(e => e.Id == musicalEvent.Id).Select(e => e.Version).SingleAsync());
    }

    private static SonivoDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<SonivoDbContext>()
            .UseInMemoryDatabase($"sonivo-apply-{Guid.NewGuid()}")
            .Options;
        return new SonivoDbContext(options);
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }
}
