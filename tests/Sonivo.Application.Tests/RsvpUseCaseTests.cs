using Sonivo.Application.Abstractions;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Scheduling;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class RsvpUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-17T12:00:00Z");
    private static readonly DateTimeOffset Starts = DateTimeOffset.Parse("2026-09-21T19:00:00Z");

    [Fact]
    public async Task Owner_can_upsert_rsvp()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var handler = new UpsertEventRsvpHandler(
            new GroupAccessService(ctx.Groups), ctx.Events, new FixedClock(Now));

        var result = await handler.HandleAsync(
            new UpsertEventRsvpCommand(ctx.Owner, ctx.GroupId, ctx.EventId, RsvpResponses.Yes),
            CancellationToken.None);

        Assert.Equal(ctx.Owner, result.UserId);
        Assert.Equal(RsvpResponses.Yes, result.Response);
        Assert.Equal(Now, result.UpdatedAt);
        Assert.Equal(1, ctx.Events.SaveCount);
        var stored = Assert.Single(ctx.Events.Events.Single(e => e.Id == ctx.EventId).Rsvps);
        Assert.Equal(ctx.Owner, stored.UserId);
        Assert.Equal(RsvpResponses.Yes, stored.Response);
    }

    [Fact]
    public async Task Member_can_upsert_rsvp()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var handler = new UpsertEventRsvpHandler(
            new GroupAccessService(ctx.Groups), ctx.Events, new FixedClock(Now));

        var result = await handler.HandleAsync(
            new UpsertEventRsvpCommand(ctx.Member, ctx.GroupId, ctx.EventId, RsvpResponses.Maybe),
            CancellationToken.None);

        Assert.Equal(ctx.Member, result.UserId);
        Assert.Equal(RsvpResponses.Maybe, result.Response);
        Assert.Equal(1, ctx.Events.SaveCount);
    }

    [Fact]
    public async Task Non_member_upsert_throws_not_found()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var handler = new UpsertEventRsvpHandler(
            new GroupAccessService(ctx.Groups), ctx.Events, new FixedClock(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new UpsertEventRsvpCommand(Guid.NewGuid(), ctx.GroupId, ctx.EventId, RsvpResponses.Yes),
                CancellationToken.None));
        Assert.Equal(0, ctx.Events.SaveCount);
        Assert.Empty(ctx.Events.Events.Single(e => e.Id == ctx.EventId).Rsvps);
    }

    [Fact]
    public async Task Cancelled_event_upsert_throws_not_found()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var cancelled = Event.Create(ctx.GroupId, "Cancelled", EventTypes.Other, Starts.AddDays(1), Now);
        ctx.Events.SeedInactive(cancelled, cancelled: true, hidden: false);
        var handler = new UpsertEventRsvpHandler(
            new GroupAccessService(ctx.Groups), ctx.Events, new FixedClock(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new UpsertEventRsvpCommand(ctx.Owner, ctx.GroupId, cancelled.Id, RsvpResponses.Yes),
                CancellationToken.None));
        Assert.Equal(0, ctx.Events.SaveCount);
    }

    [Fact]
    public async Task Hidden_event_upsert_throws_not_found()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var hidden = Event.Create(ctx.GroupId, "Hidden", EventTypes.Other, Starts.AddDays(2), Now);
        ctx.Events.SeedInactive(hidden, cancelled: false, hidden: true);
        var handler = new UpsertEventRsvpHandler(
            new GroupAccessService(ctx.Groups), ctx.Events, new FixedClock(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new UpsertEventRsvpCommand(ctx.Member, ctx.GroupId, hidden.Id, RsvpResponses.No),
                CancellationToken.None));
        Assert.Equal(0, ctx.Events.SaveCount);
    }

    [Fact]
    public async Task Invalid_response_throws_validation()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var handler = new UpsertEventRsvpHandler(
            new GroupAccessService(ctx.Groups), ctx.Events, new FixedClock(Now));

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(
                new UpsertEventRsvpCommand(ctx.Owner, ctx.GroupId, ctx.EventId, "going"),
                CancellationToken.None));
        Assert.Equal(0, ctx.Events.SaveCount);
        Assert.Empty(ctx.Events.Events.Single(e => e.Id == ctx.EventId).Rsvps);
    }

    [Fact]
    public async Task Upsert_does_not_change_event_version()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var stored = ctx.Events.Events.Single(e => e.Id == ctx.EventId);
        Assert.Equal(1, stored.Version);
        var updatedAt = stored.UpdatedAt;
        var handler = new UpsertEventRsvpHandler(
            new GroupAccessService(ctx.Groups), ctx.Events, new FixedClock(Now.AddHours(1)));

        await handler.HandleAsync(
            new UpsertEventRsvpCommand(ctx.Owner, ctx.GroupId, ctx.EventId, RsvpResponses.Yes),
            CancellationToken.None);
        await handler.HandleAsync(
            new UpsertEventRsvpCommand(ctx.Owner, ctx.GroupId, ctx.EventId, RsvpResponses.No),
            CancellationToken.None);

        Assert.Equal(1, stored.Version);
        Assert.Equal(updatedAt, stored.UpdatedAt);
        var rsvp = Assert.Single(stored.Rsvps);
        Assert.Equal(RsvpResponses.No, rsvp.Response);
        Assert.Equal(2, ctx.Events.SaveCount);
    }

    [Fact]
    public async Task List_uses_email_when_display_name_is_blank()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var access = new GroupAccessService(ctx.Groups);
        var upsert = new UpsertEventRsvpHandler(access, ctx.Events, new FixedClock(Now));
        await upsert.HandleAsync(
            new UpsertEventRsvpCommand(ctx.Owner, ctx.GroupId, ctx.EventId, RsvpResponses.Yes),
            CancellationToken.None);
        await upsert.HandleAsync(
            new UpsertEventRsvpCommand(ctx.Member, ctx.GroupId, ctx.EventId, RsvpResponses.No),
            CancellationToken.None);

        ctx.Directory.Seed(ctx.Owner, displayName: "Ada", email: "ada@example.com");
        ctx.Directory.Seed(ctx.Member, displayName: "  ", email: "member@example.com");

        var list = await new ListEventRsvpsHandler(access, ctx.Events, ctx.Directory)
            .HandleAsync(ctx.Owner, ctx.GroupId, ctx.EventId, CancellationToken.None);

        Assert.Equal(2, list.Items.Count);
        Assert.Equal("Ada", list.Items[0].DisplayName);
        Assert.Equal(ctx.Owner, list.Items[0].UserId);
        Assert.Equal(RsvpResponses.Yes, list.Items[0].Response);
        Assert.Equal("member@example.com", list.Items[1].DisplayName);
        Assert.Equal(ctx.Member, list.Items[1].UserId);
        Assert.Equal(RsvpResponses.No, list.Items[1].Response);
    }

    [Fact]
    public async Task List_cancelled_or_hidden_throws_not_found()
    {
        var ctx = await SeedOwnerAndEventAsync();
        var cancelled = Event.Create(ctx.GroupId, "Cancelled", EventTypes.Other, Starts.AddDays(1), Now);
        ctx.Events.SeedInactive(cancelled, cancelled: true, hidden: false);
        var hidden = Event.Create(ctx.GroupId, "Hidden", EventTypes.Other, Starts.AddDays(2), Now);
        ctx.Events.SeedInactive(hidden, cancelled: false, hidden: true);
        var handler = new ListEventRsvpsHandler(
            new GroupAccessService(ctx.Groups), ctx.Events, ctx.Directory);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(ctx.Owner, ctx.GroupId, cancelled.Id, CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(ctx.Member, ctx.GroupId, hidden.Id, CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_list_throws_not_found()
    {
        var ctx = await SeedOwnerAndEventAsync();

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new ListEventRsvpsHandler(
                    new GroupAccessService(ctx.Groups), ctx.Events, ctx.Directory)
                .HandleAsync(Guid.NewGuid(), ctx.GroupId, ctx.EventId, CancellationToken.None));
    }

    private static async Task<SeedContext> SeedOwnerAndEventAsync()
    {
        var groups = new FakeGroupStore();
        var events = new FakeEventStore();
        var directory = new FakeUserDirectory();
        var owner = Guid.NewGuid();
        var member = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        groups.Memberships.Add(Membership.CreateMember(group.Id, member, Now));
        await groups.SaveChangesAsync(CancellationToken.None);

        var created = await new CreateEventHandler(
                new GroupAccessService(groups), events, new FixedClock(Now))
            .HandleAsync(
                new CreateEventCommand(owner, group.Id, "Show", EventTypes.Performance, Starts),
                CancellationToken.None);
        events.SaveCount = 0;

        return new SeedContext(groups, events, directory, owner, member, group.Id, created.Id);
    }

    private sealed record SeedContext(
        FakeGroupStore Groups,
        FakeEventStore Events,
        FakeUserDirectory Directory,
        Guid Owner,
        Guid Member,
        Guid GroupId,
        Guid EventId);

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeUserDirectory : IUserDirectory
    {
        private readonly Dictionary<Guid, (string? DisplayName, string Email)> _users = [];

        public void Seed(Guid userId, string? displayName, string email)
            => _users[userId] = (displayName, email);

        public Task<IReadOnlyList<UserDirectoryEntry>> GetByIdsAsync(
            IReadOnlyCollection<Guid> userIds,
            CancellationToken cancellationToken)
        {
            var list = userIds
                .Where(_users.ContainsKey)
                .Select(id =>
                {
                    var (displayName, email) = _users[id];
                    var resolved = string.IsNullOrWhiteSpace(displayName) ? email : displayName.Trim();
                    return new UserDirectoryEntry(id, resolved);
                })
                .ToList();
            return Task.FromResult<IReadOnlyList<UserDirectoryEntry>>(list);
        }
    }

    private sealed class FakeEventStore : IEventStore
    {
        public List<Event> Events { get; } = [];
        public int SaveCount { get; set; }

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

        public Task<Event?> GetByIdWithRsvpsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken)
            => GetByIdWithItemsAsync(groupId, eventId, cancellationToken);

        public Task AddRsvpAsync(Rsvp rsvp, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task RemoveItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task AddItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task UpdateAsync(Event musicalEvent, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            SaveCount++;
            return Task.CompletedTask;
        }
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
