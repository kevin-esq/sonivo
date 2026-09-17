using Sonivo.Application.Abstractions;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class ApplyEventPlanUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-16T12:00:00Z");
    private static readonly DateTimeOffset Starts = DateTimeOffset.Parse("2026-09-21T19:00:00Z");

    [Fact]
    public async Task Owner_apply_copies_ordered_live_labels()
    {
        var ctx = await SeedReadyAsync();
        var handler = CreateHandler(ctx);

        var detail = await handler.HandleAsync(
            new ReplaceEventPlanFromSetlistCommand(
                ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, ConfirmReplace: false),
            CancellationToken.None);

        Assert.Equal(2, detail.Version);
        Assert.Equal(ctx.SetlistId, detail.SourceSetlistId);
        Assert.Equal(2, detail.Items.Count);
        Assert.Equal(ctx.ArrA, detail.Items[0].ArrangementId);
        Assert.Equal(1, detail.Items[0].SortOrder);
        Assert.Equal("Grace", detail.Items[0].DisplaySongTitle);
        Assert.Equal("Acoustic", detail.Items[0].DisplayArrangementLabel);
        Assert.Equal(ctx.ArrB, detail.Items[1].ArrangementId);
        Assert.Equal("Full Band", detail.Items[1].DisplayArrangementLabel);
    }

    [Fact]
    public async Task Second_apply_without_confirmReplace_is_409_and_plan_unchanged()
    {
        var ctx = await SeedReadyAsync();
        var handler = CreateHandler(ctx);
        await handler.HandleAsync(
            new ReplaceEventPlanFromSetlistCommand(
                ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, false),
            CancellationToken.None);

        var before = ctx.Events.Events.Single(e => e.Id == ctx.EventId).Items
            .Select(i => (i.Id, i.DisplaySongTitle, i.SortOrder))
            .ToList();

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 2, false),
                CancellationToken.None));
        Assert.Contains("confirmReplace", ex.Message, StringComparison.OrdinalIgnoreCase);

        var after = ctx.Events.Events.Single(e => e.Id == ctx.EventId);
        Assert.Equal(2, after.Version);
        Assert.Equal(before, after.Items.Select(i => (i.Id, i.DisplaySongTitle, i.SortOrder)).ToList());
    }

    [Fact]
    public async Task Second_apply_with_confirmReplace_replaces_with_current_template()
    {
        var ctx = await SeedReadyAsync();
        var handler = CreateHandler(ctx);
        await handler.HandleAsync(
            new ReplaceEventPlanFromSetlistCommand(
                ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, false),
            CancellationToken.None);

        // Edit setlist: only ArrB first, then ArrA
        var setlist = ctx.Setlists.Setlists.Single(s => s.Id == ctx.SetlistId);
        setlist.Items.Clear();
        setlist.Items.Add(SetlistItem.Create(setlist.Id, ctx.GroupId, ctx.ArrB, 1));
        setlist.Items.Add(SetlistItem.Create(setlist.Id, ctx.GroupId, ctx.ArrA, 2));

        var replaced = await handler.HandleAsync(
            new ReplaceEventPlanFromSetlistCommand(
                ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 2, true),
            CancellationToken.None);

        Assert.Equal(3, replaced.Version);
        Assert.Equal(2, replaced.Items.Count);
        Assert.Equal(ctx.ArrB, replaced.Items[0].ArrangementId);
        Assert.Equal(ctx.ArrA, replaced.Items[1].ArrangementId);
    }

    [Fact]
    public async Task After_apply_setlist_edit_does_not_change_event_plan()
    {
        var ctx = await SeedReadyAsync();
        var handler = CreateHandler(ctx);
        await handler.HandleAsync(
            new ReplaceEventPlanFromSetlistCommand(
                ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, false),
            CancellationToken.None);

        var setlist = ctx.Setlists.Setlists.Single(s => s.Id == ctx.SetlistId);
        setlist.Items.Clear();
        setlist.Items.Add(SetlistItem.Create(setlist.Id, ctx.GroupId, ctx.ArrB, 1));

        var song = ctx.Songs.Songs.Single();
        song.Update("Renamed Grace", song.Attribution, song.OriginKind, song.RightsNotes, song.Version, Now.AddHours(1));

        var detail = await new GetEventHandler(new GroupAccessService(ctx.Groups), ctx.Events)
            .HandleAsync(ctx.Owner, ctx.GroupId, ctx.EventId, CancellationToken.None);

        Assert.Equal(2, detail.Items.Count);
        Assert.Equal("Grace", detail.Items[0].DisplaySongTitle);
        Assert.Equal("Acoustic", detail.Items[0].DisplayArrangementLabel);
        Assert.Equal(ctx.ArrA, detail.Items[0].ArrangementId);
    }

    [Fact]
    public async Task Soft_deleted_template_arrangement_blocks_apply_with_no_writes()
    {
        var ctx = await SeedReadyAsync();
        ctx.Arrangements.SoftDeletedIds.Add(ctx.ArrB);
        var handler = CreateHandler(ctx);

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, false),
                CancellationToken.None));

        var stored = ctx.Events.Events.Single(e => e.Id == ctx.EventId);
        Assert.Equal(1, stored.Version);
        Assert.Empty(stored.Items);
        Assert.Null(stored.SourceSetlistId);
    }

    [Fact]
    public async Task Empty_setlist_apply_is_400_and_does_not_wipe_plan()
    {
        var ctx = await SeedReadyAsync();
        var handler = CreateHandler(ctx);
        await handler.HandleAsync(
            new ReplaceEventPlanFromSetlistCommand(
                ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, false),
            CancellationToken.None);

        var empty = Setlist.Create(ctx.GroupId, "Empty", Now);
        await ctx.Setlists.AddAsync(empty, CancellationToken.None);

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    ctx.Owner, ctx.GroupId, ctx.EventId, empty.Id, 2, true),
                CancellationToken.None));

        var stored = ctx.Events.Events.Single(e => e.Id == ctx.EventId);
        Assert.Equal(2, stored.Version);
        Assert.Equal(2, stored.Items.Count);
    }

    [Fact]
    public async Task Stale_expectedVersion_is_409_with_no_write()
    {
        var ctx = await SeedReadyAsync();
        var handler = CreateHandler(ctx);

        await Assert.ThrowsAsync<ConflictException>(() =>
            handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 99, false),
                CancellationToken.None));

        var stored = ctx.Events.Events.Single(e => e.Id == ctx.EventId);
        Assert.Equal(1, stored.Version);
        Assert.Empty(stored.Items);
    }

    [Fact]
    public async Task Member_apply_is_forbidden()
    {
        var ctx = await SeedReadyAsync(withMember: true);
        var handler = CreateHandler(ctx);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    ctx.Member!.Value, ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, false),
                CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_apply_is_not_found()
    {
        var ctx = await SeedReadyAsync();
        var handler = CreateHandler(ctx);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    Guid.NewGuid(), ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, false),
                CancellationToken.None));
    }

    [Fact]
    public async Task Cross_group_setlist_is_not_found()
    {
        var ctx = await SeedReadyAsync();
        var otherGroup = Group.Create("Other", Now);
        await ctx.Groups.AddAsync(
            otherGroup,
            Membership.CreateOwner(otherGroup.Id, ctx.Owner, Now),
            CancellationToken.None);
        var foreign = Setlist.Create(otherGroup.Id, "Foreign", Now);
        foreign.Items.Add(SetlistItem.Create(foreign.Id, otherGroup.Id, Guid.NewGuid(), 1));
        await ctx.Setlists.AddAsync(foreign, CancellationToken.None);

        var handler = CreateHandler(ctx);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    ctx.Owner, ctx.GroupId, ctx.EventId, foreign.Id, 1, false),
                CancellationToken.None));
    }

    [Fact]
    public async Task Cancelled_event_cannot_apply()
    {
        var ctx = await SeedReadyAsync();
        var stored = ctx.Events.Events.Single(e => e.Id == ctx.EventId);
        typeof(Event).GetProperty(nameof(Event.Status))!
            .SetValue(stored, EventStatuses.Cancelled);

        var handler = CreateHandler(ctx);
        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    ctx.Owner, ctx.GroupId, ctx.EventId, ctx.SetlistId, 1, false),
                CancellationToken.None));
    }

    private static ReplaceEventPlanFromSetlistHandler CreateHandler(Fixture ctx) => new(
        new GroupAccessService(ctx.Groups),
        ctx.Events,
        ctx.Setlists,
        ctx.Arrangements,
        ctx.Songs,
        ctx.UnitOfWork,
        new FixedClock(Now));

    private static async Task<Fixture> SeedReadyAsync(bool withMember = false)
    {
        var groups = new FakeGroupStore();
        var events = new FakeEventStore();
        var setlists = new FakeSetlistStore();
        var arrangements = new FakeArrangementStore();
        var songs = new FakeSongStore();
        var unitOfWork = new FakeUnitOfWork(events);
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);

        Guid? member = null;
        if (withMember)
        {
            member = Guid.NewGuid();
            groups.Memberships.Add(Membership.CreateMember(group.Id, member.Value, Now));
        }

        var song = Song.Create(group.Id, "Grace", SongOriginKinds.Original, Now);
        await songs.AddAsync(song, CancellationToken.None);
        var arrA = Arrangement.Create(group.Id, song.Id, "Acoustic", Now);
        var arrB = Arrangement.Create(group.Id, song.Id, "Full Band", Now);
        await arrangements.AddAsync(arrA, CancellationToken.None);
        await arrangements.AddAsync(arrB, CancellationToken.None);

        var setlist = Setlist.Create(group.Id, "Sunday", Now);
        setlist.Items.Add(SetlistItem.Create(setlist.Id, group.Id, arrA.Id, 1));
        setlist.Items.Add(SetlistItem.Create(setlist.Id, group.Id, arrB.Id, 2));
        await setlists.AddAsync(setlist, CancellationToken.None);

        var musicalEvent = Event.Create(group.Id, "Rehearsal", EventTypes.Rehearsal, Starts, Now);
        await events.AddAsync(musicalEvent, CancellationToken.None);

        return new Fixture(
            groups, events, setlists, arrangements, songs, unitOfWork,
            owner, member, group.Id, setlist.Id, musicalEvent.Id, arrA.Id, arrB.Id);
    }

    private sealed record Fixture(
        FakeGroupStore Groups,
        FakeEventStore Events,
        FakeSetlistStore Setlists,
        FakeArrangementStore Arrangements,
        FakeSongStore Songs,
        FakeUnitOfWork UnitOfWork,
        Guid Owner,
        Guid? Member,
        Guid GroupId,
        Guid SetlistId,
        Guid EventId,
        Guid ArrA,
        Guid ArrB);

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeUnitOfWork(FakeEventStore events) : IUnitOfWork
    {
        public Task SaveChangesAsync(CancellationToken cancellationToken)
            => events.SaveChangesAsync(cancellationToken);
    }

    private sealed class FakeEventStore : IEventStore
    {
        public List<Event> Events { get; } = [];

        public Task AddAsync(Event musicalEvent, CancellationToken cancellationToken)
        {
            Events.Add(musicalEvent);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Event>> ListActiveByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Event>>(
                Events.Where(e => e.GroupId == groupId).ToList());

        public Task<Event?> GetByIdWithItemsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken)
            => Task.FromResult(Events.FirstOrDefault(e => e.GroupId == groupId && e.Id == eventId));

        public Task<Event?> GetByIdWithRsvpsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken)
            => GetByIdWithItemsAsync(groupId, eventId, cancellationToken);

        public Task AddRsvpAsync(Rsvp rsvp, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task RemoveItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task AddItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task UpdateAsync(Event musicalEvent, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeSetlistStore : ISetlistStore
    {
        public List<Setlist> Setlists { get; } = [];

        public Task AddAsync(Setlist setlist, CancellationToken cancellationToken)
        {
            Setlists.Add(setlist);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Setlist>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Setlist>>(Setlists.Where(s => s.GroupId == groupId).ToList());

        public Task<Setlist?> GetByIdAsync(Guid groupId, Guid setlistId, CancellationToken cancellationToken)
            => Task.FromResult(Setlists.FirstOrDefault(s => s.GroupId == groupId && s.Id == setlistId));

        public Task<Setlist?> GetByIdWithItemsAsync(Guid groupId, Guid setlistId, CancellationToken cancellationToken)
            => GetByIdAsync(groupId, setlistId, cancellationToken);

        public Task RemoveItemsAsync(IEnumerable<SetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task AddItemsAsync(IEnumerable<SetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task UpdateAsync(Setlist setlist, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeArrangementStore : IArrangementStore
    {
        public List<Arrangement> Arrangements { get; } = [];
        public HashSet<Guid> SoftDeletedIds { get; } = [];

        public Task AddAsync(Arrangement arrangement, CancellationToken cancellationToken)
        {
            Arrangements.Add(arrangement);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Arrangement>> ListBySongAsync(
            Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Arrangement>>(
                Arrangements.Where(a => a.GroupId == groupId && a.SongId == songId && !SoftDeletedIds.Contains(a.Id)).ToList());

        public Task<IReadOnlyList<Arrangement>> ListLiveTrackedBySongAsync(
            Guid groupId, Guid songId, CancellationToken cancellationToken)
            => ListBySongAsync(groupId, songId, cancellationToken);

        public Task<Arrangement?> GetByIdAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult(
                Arrangements.FirstOrDefault(a =>
                    a.GroupId == groupId && a.Id == arrangementId && !SoftDeletedIds.Contains(a.Id)));

        public Task<Arrangement?> GetByIdWithResourcesAsync(
            Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => GetByIdAsync(groupId, arrangementId, cancellationToken);

        public Task UpdateAsync(Arrangement arrangement, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeSongStore : ISongStore
    {
        public List<Song> Songs { get; } = [];

        public Task AddAsync(Song song, CancellationToken cancellationToken)
        {
            Songs.Add(song);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Song>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Song>>(Songs.Where(s => s.GroupId == groupId).ToList());

        public Task<Song?> GetByIdAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(Songs.FirstOrDefault(s => s.GroupId == groupId && s.Id == songId));

        public Task<int> CountLiveArrangementsAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult(0);

        public Task UpdateAsync(Song song, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeGroupStore : IGroupStore
    {
        public List<Group> Groups { get; } = [];
        public List<Membership> Memberships { get; } = [];

        public Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken)
        {
            Groups.Add(group);
            Memberships.Add(ownerMembership);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<GroupListItem>>([]);

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Groups.FirstOrDefault(g => g.Id == groupId && !g.IsDeleted));

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Memberships.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
        {
            Memberships.Add(membership);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
