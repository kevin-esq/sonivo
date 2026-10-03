using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class PresenceUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public async Task Heartbeat_touches_last_seen()
    {
        var directory = new FakeUserDirectory();
        var handler = new PresenceHeartbeatHandler(directory);

        await handler.HandleAsync(new PresenceHeartbeatCommand(Guid.NewGuid(), Now), CancellationToken.None);

        Assert.True(directory.Touched);
    }

    [Fact]
    public async Task Member_list_includes_email_and_last_seen()
    {
        var owner = Guid.NewGuid();
        var groups = new FakeGroupStore();
        var memberships = new FakeMembershipStore();
        var directory = new FakeUserDirectory();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        memberships.Rows.Add(Membership.CreateMember(group.Id, owner, Now));
        directory.Seed(owner, "Kevin", "kevin@example.com", Now);

        var items = (await new ListMembersHandler(new GroupAccessService(groups), memberships, directory)
            .HandleAsync(new ListMembersQuery(owner, group.Id), CancellationToken.None)).Items;

        var single = Assert.Single(items);
        Assert.Equal("kevin@example.com", single.Email);
        Assert.Equal(Now, single.LastSeenAt);
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

        public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
        {
            Memberships.Add(membership);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<GroupListItem>>(
                Memberships.Where(m => m.UserId == userId).Select(m => new GroupListItem(
                    m.GroupId, "Band", null, m.Role, 1, Now, 1, null, null)).ToList());

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Groups.FirstOrDefault(g => g.Id == groupId && !g.IsDeleted));

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Memberships.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeMembershipStore : IMembershipStore
    {
        public List<Membership> Rows { get; } = [];

        public Task<IReadOnlyList<Membership>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Membership>>(Rows.Where(m => m.GroupId == groupId).ToList());

        public Task<Membership?> GetForUpdateAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Rows.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task RemoveAsync(Membership membership, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<int> CountOwnersAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Rows.Count(m => m.GroupId == groupId && m.IsOwner));
    }

    private sealed class FakeUserDirectory : IUserDirectory
    {
        private readonly Dictionary<Guid, UserDirectoryEntry> _entries = [];
        public bool Touched { get; private set; }

        public void Seed(Guid userId, string displayName, string email, DateTimeOffset lastSeenAt)
            => _entries[userId] = new UserDirectoryEntry(userId, displayName, lastSeenAt, email);

        public Task<IReadOnlyList<UserDirectoryEntry>> GetByIdsAsync(
            IReadOnlyCollection<Guid> userIds,
            CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<UserDirectoryEntry>>(
                userIds.Where(_entries.ContainsKey).Select(id => _entries[id]).ToList());

        public Task TouchLastSeenAsync(Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
        {
            Touched = true;
            if (_entries.TryGetValue(userId, out var entry))
            {
                _entries[userId] = entry with { LastSeenAt = now };
            }
            return Task.CompletedTask;
        }
    }
}
