using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class MembershipUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-17T12:00:00Z");

    [Fact]
    public async Task List_returns_owner_then_member_by_name()
    {
        var (groups, memberships, directory, owner, member, groupId) = await SeedOwnerAndMemberAsync();
        directory.Seed(owner, "Zed Owner", "zed@example.com");
        directory.Seed(member, "Ann Member", "ann@example.com");

        var list = await new ListMembersHandler(
                new GroupAccessService(groups), memberships, directory)
            .HandleAsync(new ListMembersQuery(owner, groupId), CancellationToken.None);

        Assert.Equal(2, list.Items.Count);
        Assert.Equal(MembershipRoles.Owner, list.Items[0].Role);
        Assert.Equal("Zed Owner", list.Items[0].DisplayName);
        Assert.Equal(MembershipRoles.Member, list.Items[1].Role);
        Assert.Equal("Ann Member", list.Items[1].DisplayName);
    }

    [Fact]
    public async Task List_non_member_throws_not_found()
    {
        var (groups, memberships, directory, _, _, groupId) = await SeedOwnerAndMemberAsync();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            new ListMembersHandler(new GroupAccessService(groups), memberships, directory)
                .HandleAsync(new ListMembersQuery(Guid.NewGuid(), groupId), CancellationToken.None));
    }

    [Fact]
    public async Task Remove_member_deletes_row()
    {
        var (groups, memberships, _, owner, member, groupId) = await SeedOwnerAndMemberAsync();
        var uow = new FakeUnitOfWork();

        await new RemoveMemberHandler(new GroupAccessService(groups), memberships, uow)
            .HandleAsync(new RemoveMemberCommand(owner, groupId, member), CancellationToken.None);

        Assert.DoesNotContain(memberships.Rows, m => m.UserId == member);
        Assert.Equal(1, uow.SaveCount);
    }

    [Fact]
    public async Task Remove_self_throws_validation()
    {
        var (groups, memberships, _, owner, _, groupId) = await SeedOwnerAndMemberAsync();
        await Assert.ThrowsAsync<ValidationException>(() =>
            new RemoveMemberHandler(new GroupAccessService(groups), memberships, new FakeUnitOfWork())
                .HandleAsync(new RemoveMemberCommand(owner, groupId, owner), CancellationToken.None));
    }

    [Fact]
    public async Task Remove_other_owner_when_two_owners_succeeds()
    {
        var (groups, memberships, owner, groupId) = await SeedOwnerOnlyAsync();
        var other = Guid.NewGuid();
        memberships.Rows.Add(Membership.CreateOwner(groupId, other, Now));
        await groups.AddMembershipAsync(memberships.Rows.Single(m => m.UserId == other), CancellationToken.None);
        var uow = new FakeUnitOfWork();

        await new RemoveMemberHandler(new GroupAccessService(groups), memberships, uow)
            .HandleAsync(new RemoveMemberCommand(owner, groupId, other), CancellationToken.None);

        Assert.DoesNotContain(memberships.Rows, m => m.UserId == other);
        Assert.Equal(1, uow.SaveCount);
    }

    [Fact]
    public async Task Member_remove_throws_forbidden()
    {
        var (groups, memberships, _, owner, member, groupId) = await SeedOwnerAndMemberAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new RemoveMemberHandler(new GroupAccessService(groups), memberships, new FakeUnitOfWork())
                .HandleAsync(new RemoveMemberCommand(member, groupId, owner), CancellationToken.None));
    }

    [Fact]
    public async Task Promote_member_to_owner()
    {
        var (groups, memberships, _, owner, member, groupId) = await SeedOwnerAndMemberAsync();
        var uow = new FakeUnitOfWork();

        await new ChangeMemberRoleHandler(new GroupAccessService(groups), memberships, uow)
            .HandleAsync(
                new ChangeMemberRoleCommand(owner, groupId, member, MembershipRoles.Owner),
                CancellationToken.None);

        Assert.Equal(MembershipRoles.Owner, memberships.Rows.Single(m => m.UserId == member).Role);
        Assert.Equal(1, uow.SaveCount);
    }

    [Fact]
    public async Task Demote_last_owner_throws_conflict()
    {
        var (groups, memberships, owner, groupId) = await SeedOwnerOnlyAsync();
        await Assert.ThrowsAsync<ConflictException>(() =>
            new ChangeMemberRoleHandler(new GroupAccessService(groups), memberships, new FakeUnitOfWork())
                .HandleAsync(
                    new ChangeMemberRoleCommand(owner, groupId, owner, MembershipRoles.Member),
                    CancellationToken.None));
    }

    [Fact]
    public async Task Leave_member_removes_membership()
    {
        var (groups, memberships, _, _, member, groupId) = await SeedOwnerAndMemberAsync();
        var uow = new FakeUnitOfWork();

        await new LeaveGroupHandler(new GroupAccessService(groups), memberships, uow)
            .HandleAsync(new LeaveGroupCommand(member, groupId), CancellationToken.None);

        Assert.DoesNotContain(memberships.Rows, m => m.UserId == member);
        Assert.Equal(1, uow.SaveCount);
    }

    [Fact]
    public async Task Leave_last_owner_throws_conflict()
    {
        var (groups, memberships, owner, groupId) = await SeedOwnerOnlyAsync();
        await Assert.ThrowsAsync<ConflictException>(() =>
            new LeaveGroupHandler(new GroupAccessService(groups), memberships, new FakeUnitOfWork())
                .HandleAsync(new LeaveGroupCommand(owner, groupId), CancellationToken.None));
    }

    private static async Task<(FakeGroupStore Groups, FakeMembershipStore Memberships, Guid Owner, Guid GroupId)>
        SeedOwnerOnlyAsync()
    {
        var groups = new FakeGroupStore();
        var memberships = new FakeMembershipStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        memberships.Rows.AddRange(groups.Memberships);
        return (groups, memberships, owner, group.Id);
    }

    private static async Task<(
        FakeGroupStore Groups,
        FakeMembershipStore Memberships,
        FakeUserDirectory Directory,
        Guid Owner,
        Guid Member,
        Guid GroupId)> SeedOwnerAndMemberAsync()
    {
        var groups = new FakeGroupStore();
        var memberships = new FakeMembershipStore();
        var directory = new FakeUserDirectory();
        var owner = Guid.NewGuid();
        var member = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        var memberRow = Membership.CreateMember(group.Id, member, Now);
        await groups.AddMembershipAsync(memberRow, CancellationToken.None);
        memberships.Rows.AddRange(groups.Memberships);
        return (groups, memberships, directory, owner, member, group.Id);
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCount { get; private set; }

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            SaveCount++;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeUserDirectory : IUserDirectory
    {
        private readonly Dictionary<Guid, string> _names = [];

        public void Seed(Guid userId, string displayName, string email)
            => _names[userId] = displayName;

        public Task<IReadOnlyList<UserDirectoryEntry>> GetByIdsAsync(
            IReadOnlyCollection<Guid> userIds,
            CancellationToken cancellationToken)
        {
            var list = userIds
                .Where(_names.ContainsKey)
                .Select(id => new UserDirectoryEntry(id, _names[id]))
                .ToList();
            return Task.FromResult<IReadOnlyList<UserDirectoryEntry>>(list);
        }
    }

    private sealed class FakeMembershipStore : IMembershipStore
    {
        public List<Membership> Rows { get; } = [];

        public Task<IReadOnlyList<Membership>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Membership>>(Rows.Where(m => m.GroupId == groupId).ToList());

        public Task<Membership?> GetForUpdateAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Rows.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task RemoveAsync(Membership membership, CancellationToken cancellationToken)
        {
            Rows.Remove(membership);
            return Task.CompletedTask;
        }

        public Task<int> CountOwnersAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Rows.Count(m => m.GroupId == groupId && m.IsOwner));
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
            => Task.FromResult<IReadOnlyList<GroupListItem>>([]);

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Groups.FirstOrDefault(g => g.Id == groupId && !g.IsDeleted));

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Memberships.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
