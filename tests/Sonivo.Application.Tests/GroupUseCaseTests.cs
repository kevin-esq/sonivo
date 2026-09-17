using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class GroupUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");

    [Fact]
    public async Task CreateGroup_makes_authenticated_user_owner_atomically()
    {
        var store = new FakeGroupStore();
        var clock = new FixedClock(Now);
        var handler = new CreateGroupHandler(store, clock);
        var userId = Guid.NewGuid();

        var result = await handler.HandleAsync(new CreateGroupCommand(userId, "Night Owls"), CancellationToken.None);

        Assert.Equal("Night Owls", result.Name);
        Assert.Equal(1, result.Version);
        Assert.Equal(MembershipRoles.Owner, result.Role);
        Assert.Single(store.Groups);
        Assert.Single(store.Memberships);
        Assert.Equal(userId, store.Memberships[0].UserId);
        Assert.Equal(MembershipRoles.Owner, store.Memberships[0].Role);
        Assert.Equal(store.Groups[0].Id, store.Memberships[0].GroupId);
        Assert.True(store.SaveCount >= 1);
    }

    [Fact]
    public async Task CreateGroup_rejects_spoofed_empty_user()
    {
        var handler = new CreateGroupHandler(new FakeGroupStore(), new FixedClock(Now));
        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(new CreateGroupCommand(Guid.Empty, "Band"), CancellationToken.None));
    }

    [Fact]
    public async Task ListMyGroups_returns_only_memberships_for_user()
    {
        var store = new FakeGroupStore();
        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();
        var groupA = Group.Create("A", Now);
        var groupB = Group.Create("B", Now);
        await store.AddAsync(groupA, Membership.CreateOwner(groupA.Id, userA, Now), CancellationToken.None);
        await store.AddAsync(groupB, Membership.CreateOwner(groupB.Id, userB, Now), CancellationToken.None);
        await store.SaveChangesAsync(CancellationToken.None);

        var list = await new ListMyGroupsHandler(store).HandleAsync(userA, CancellationToken.None);

        Assert.Single(list);
        Assert.Equal(groupA.Id, list[0].Id);
    }

    [Fact]
    public async Task GetGroup_non_member_throws_not_found()
    {
        var store = new FakeGroupStore();
        var owner = Guid.NewGuid();
        var stranger = Guid.NewGuid();
        var group = Group.Create("Private", Now);
        await store.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        await store.SaveChangesAsync(CancellationToken.None);

        var access = new GroupAccessService(store);
        var handler = new GetGroupHandler(access);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(stranger, group.Id, CancellationToken.None));
    }

    [Fact]
    public async Task UpdateGroup_member_throws_forbidden()
    {
        var store = new FakeGroupStore();
        var owner = Guid.NewGuid();
        var member = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await store.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        store.Memberships.Add(Membership.CreateMember(group.Id, member, Now));
        await store.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateGroupHandler(new GroupAccessService(store), store, new FixedClock(Now));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.HandleAsync(
                new UpdateGroupCommand(member, group.Id, "Other", 1),
                CancellationToken.None));
    }

    [Fact]
    public async Task UpdateGroup_owner_increments_version()
    {
        var store = new FakeGroupStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await store.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        await store.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateGroupHandler(new GroupAccessService(store), store, new FixedClock(Now.AddMinutes(1)));
        var result = await handler.HandleAsync(
            new UpdateGroupCommand(owner, group.Id, "Renamed", 1),
            CancellationToken.None);

        Assert.Equal("Renamed", result.Name);
        Assert.Equal(2, result.Version);
    }

    [Fact]
    public async Task UpdateGroup_stale_version_throws_conflict()
    {
        var store = new FakeGroupStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await store.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        await store.SaveChangesAsync(CancellationToken.None);

        var handler = new UpdateGroupHandler(new GroupAccessService(store), store, new FixedClock(Now));

        await Assert.ThrowsAsync<ConflictException>(() =>
            handler.HandleAsync(
                new UpdateGroupCommand(owner, group.Id, "Renamed", 99),
                CancellationToken.None));
    }

    [Fact]
    public async Task SoftDelete_hides_group_from_normal_lookup_and_list()
    {
        var store = new FakeGroupStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await store.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        await store.SaveChangesAsync(CancellationToken.None);

        await new SoftDeleteGroupHandler(new GroupAccessService(store), store, new FixedClock(Now.AddHours(1)))
            .HandleAsync(new SoftDeleteGroupCommand(owner, group.Id, 1), CancellationToken.None);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new GetGroupHandler(new GroupAccessService(store))
                .HandleAsync(owner, group.Id, CancellationToken.None));

        var list = await new ListMyGroupsHandler(store).HandleAsync(owner, CancellationToken.None);
        Assert.Empty(list);
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeGroupStore : IGroupStore
    {
        public List<Group> Groups { get; } = [];
        public List<Membership> Memberships { get; } = [];
        public int SaveCount { get; private set; }

        public Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken)
        {
            Groups.Add(group);
            Memberships.Add(ownerMembership);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
        {
            var items = Memberships
                .Where(m => m.UserId == userId)
                .Join(Groups.Where(g => !g.IsDeleted), m => m.GroupId, g => g.Id,
                    (m, g) => new GroupListItem(g.Id, g.Name, m.Role, g.Version, g.CreatedAt))
                .OrderBy(x => x.Name)
                .ToList();
            return Task.FromResult<IReadOnlyList<GroupListItem>>(items);
        }

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

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            SaveCount++;
            return Task.CompletedTask;
        }
    }
}
