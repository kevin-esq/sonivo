using Sonivo.Application.Abstractions;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class EventUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-16T12:00:00Z");
    private static readonly DateTimeOffset Starts = DateTimeOffset.Parse("2026-09-21T19:00:00Z");

    [Fact]
    public async Task Owner_can_create_scheduled_event()
    {
        var (groups, events, owner, groupId) = await SeedOwnerAsync();
        var handler = new CreateEventHandler(new GroupAccessService(groups), events, new FixedClock(Now));

        var created = await handler.HandleAsync(
            new CreateEventCommand(owner, groupId, "Sunday rehearsal", EventTypes.Rehearsal, Starts),
            CancellationToken.None);

        Assert.Equal("Sunday rehearsal", created.Title);
        Assert.Equal(EventTypes.Rehearsal, created.Type);
        Assert.Equal(Starts, created.StartsAt);
        Assert.Equal(EventStatuses.Scheduled, created.Status);
        Assert.Equal(1, created.Version);
        Assert.Empty(created.Items);
        Assert.Single(events.Events);
    }

    [Fact]
    public async Task Member_cannot_create_event()
    {
        var (groups, events, _, groupId, member) = await SeedOwnerAndMemberAsync();
        var handler = new CreateEventHandler(new GroupAccessService(groups), events, new FixedClock(Now));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.HandleAsync(
                new CreateEventCommand(member, groupId, "Nope", EventTypes.Rehearsal, Starts),
                CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_create_throws_not_found()
    {
        var (groups, events, _, groupId) = await SeedOwnerAsync();
        var handler = new CreateEventHandler(new GroupAccessService(groups), events, new FixedClock(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new CreateEventCommand(Guid.NewGuid(), groupId, "Nope", EventTypes.Rehearsal, Starts),
                CancellationToken.None));
    }

    [Fact]
    public async Task Create_rejects_invalid_type_and_blank_title()
    {
        var (groups, events, owner, groupId) = await SeedOwnerAsync();
        var handler = new CreateEventHandler(new GroupAccessService(groups), events, new FixedClock(Now));

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(
                new CreateEventCommand(owner, groupId, "  ", EventTypes.Rehearsal, Starts),
                CancellationToken.None));

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(
                new CreateEventCommand(owner, groupId, "Gig", "invalid", Starts),
                CancellationToken.None));
    }

    [Fact]
    public async Task Member_can_list_and_get_event_with_empty_plan()
    {
        var (groups, events, owner, groupId, member) = await SeedOwnerAndMemberAsync();
        var access = new GroupAccessService(groups);
        var created = await new CreateEventHandler(access, events, new FixedClock(Now))
            .HandleAsync(
                new CreateEventCommand(owner, groupId, "Show", EventTypes.Performance, Starts),
                CancellationToken.None);

        var list = await new ListEventsHandler(access, events)
            .HandleAsync(member, groupId, CancellationToken.None);
        Assert.Single(list);
        Assert.Equal("Show", list[0].Title);
        Assert.Equal(EventTypes.Performance, list[0].Type);

        var detail = await new GetEventHandler(access, events)
            .HandleAsync(member, groupId, created.Id, CancellationToken.None);
        Assert.Equal(Starts, detail.StartsAt);
        Assert.Empty(detail.Items);
    }

    [Fact]
    public async Task List_excludes_cancelled_and_hidden()
    {
        var (groups, events, owner, groupId, member) = await SeedOwnerAndMemberAsync();
        var access = new GroupAccessService(groups);
        var visible = await new CreateEventHandler(access, events, new FixedClock(Now))
            .HandleAsync(
                new CreateEventCommand(owner, groupId, "Visible", EventTypes.Rehearsal, Starts),
                CancellationToken.None);

        events.SeedInactive(
            Event.Create(groupId, "Cancelled", EventTypes.Other, Starts.AddDays(1), Now),
            cancelled: true,
            hidden: false);
        events.SeedInactive(
            Event.Create(groupId, "Hidden", EventTypes.Other, Starts.AddDays(2), Now),
            cancelled: false,
            hidden: true);

        var list = await new ListEventsHandler(access, events)
            .HandleAsync(member, groupId, CancellationToken.None);
        Assert.Single(list);
        Assert.Equal(visible.Id, list[0].Id);
    }

    [Fact]
    public async Task Detail_plan_uses_copied_labels_without_arrangement_lookup()
    {
        var (groups, events, owner, groupId, member) = await SeedOwnerAndMemberAsync();
        var access = new GroupAccessService(groups);
        var created = await new CreateEventHandler(access, events, new FixedClock(Now))
            .HandleAsync(
                new CreateEventCommand(owner, groupId, "With plan", EventTypes.Rehearsal, Starts),
                CancellationToken.None);

        var stored = events.Events.Single(e => e.Id == created.Id);
        stored.Items.Add(new EventSetlistItem
        {
            Id = Guid.NewGuid(),
            EventId = stored.Id,
            GroupId = groupId,
            ArrangementId = Guid.NewGuid(),
            DisplaySongTitle = "Copied Song",
            DisplayArrangementLabel = "Copied Arr",
            SortOrder = 1,
            CreatedAt = Now
        });

        var detail = await new GetEventHandler(access, events)
            .HandleAsync(member, groupId, created.Id, CancellationToken.None);

        Assert.Single(detail.Items);
        Assert.Equal("Copied Song", detail.Items[0].DisplaySongTitle);
        Assert.Equal("Copied Arr", detail.Items[0].DisplayArrangementLabel);
    }

    [Fact]
    public async Task Non_member_get_throws_not_found()
    {
        var (groups, events, owner, groupId) = await SeedOwnerAsync();
        var created = await new CreateEventHandler(new GroupAccessService(groups), events, new FixedClock(Now))
            .HandleAsync(
                new CreateEventCommand(owner, groupId, "Private", EventTypes.Rehearsal, Starts),
                CancellationToken.None);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetEventHandler(new GroupAccessService(groups), events)
                .HandleAsync(Guid.NewGuid(), groupId, created.Id, CancellationToken.None));
    }

    private static async Task<(FakeGroupStore Groups, FakeEventStore Events, Guid Owner, Guid GroupId)> SeedOwnerAsync()
    {
        var groups = new FakeGroupStore();
        var events = new FakeEventStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        await groups.SaveChangesAsync(CancellationToken.None);
        return (groups, events, owner, group.Id);
    }

    private static async Task<(
        FakeGroupStore Groups,
        FakeEventStore Events,
        Guid Owner,
        Guid GroupId,
        Guid Member)> SeedOwnerAndMemberAsync()
    {
        var seed = await SeedOwnerAsync();
        var member = Guid.NewGuid();
        seed.Groups.Memberships.Add(Membership.CreateMember(seed.GroupId, member, Now));
        return (seed.Groups, seed.Events, seed.Owner, seed.GroupId, member);
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeEventStore : IEventStore
    {
        public List<Event> Events { get; } = [];

        public Task AddAsync(Event musicalEvent, CancellationToken cancellationToken)
        {
            Events.Add(musicalEvent);
            return Task.CompletedTask;
        }

        public void SeedInactive(Event musicalEvent, bool cancelled, bool hidden)
        {
            typeof(Event).GetProperty(nameof(Event.Status))!
                .SetValue(musicalEvent, cancelled ? EventStatuses.Cancelled : EventStatuses.Scheduled);
            typeof(Event).GetProperty(nameof(Event.IsHidden))!
                .SetValue(musicalEvent, hidden);
            Events.Add(musicalEvent);
        }

        public Task<IReadOnlyList<Event>> ListActiveByGroupAsync(Guid groupId, CancellationToken cancellationToken)
        {
            var list = Events
                .Where(e =>
                    e.GroupId == groupId
                    && e.Status == EventStatuses.Scheduled
                    && !e.IsHidden)
                .OrderBy(e => e.StartsAt)
                .ThenBy(e => e.Id)
                .ToList();
            return Task.FromResult<IReadOnlyList<Event>>(list);
        }

        public Task<Event?> GetByIdWithItemsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken)
            => Task.FromResult(Events.FirstOrDefault(e => e.GroupId == groupId && e.Id == eventId));

        public Task RemoveItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task AddItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task UpdateAsync(Event musicalEvent, CancellationToken cancellationToken) => Task.CompletedTask;

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

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
