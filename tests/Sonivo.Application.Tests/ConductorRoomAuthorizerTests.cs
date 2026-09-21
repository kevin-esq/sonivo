using Sonivo.Application.Abstractions;
using Sonivo.Application.Realtime;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class ConductorRoomAuthorizerTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;

    [Fact]
    public async Task Unknown_event_throws_not_found()
    {
        var authorizer = Build(groupId: null);

        await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireMemberAsync(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireOwnerAsync(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_throws_not_found_without_leaking()
    {
        var groupId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var authorizer = Build(groupId, membership: null);

        var memberEx = await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireMemberAsync(Guid.NewGuid(), userId, CancellationToken.None));
        Assert.Equal("Event not found.", memberEx.Message);

        await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireOwnerAsync(Guid.NewGuid(), userId, CancellationToken.None));
        _ = groupId;
    }

    [Fact]
    public async Task Member_can_join_but_cannot_conduct()
    {
        var userId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var membership = Membership.CreateMember(groupId, userId, Now);
        var authorizer = Build(groupId, membership);

        var access = await authorizer.RequireMemberAsync(Guid.NewGuid(), userId, CancellationToken.None);
        Assert.Equal(groupId, access.GroupId);
        Assert.False(access.IsOwner);

        var forbidden = await Assert.ThrowsAsync<ForbiddenException>(
            () => authorizer.RequireOwnerAsync(Guid.NewGuid(), userId, CancellationToken.None));
        Assert.Equal("Owner role required.", forbidden.Message);
    }

    [Fact]
    public async Task Owner_can_join_and_conduct()
    {
        var userId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var membership = Membership.CreateOwner(groupId, userId, Now);
        var authorizer = Build(groupId, membership);

        var member = await authorizer.RequireMemberAsync(Guid.NewGuid(), userId, CancellationToken.None);
        Assert.True(member.IsOwner);

        var owner = await authorizer.RequireOwnerAsync(Guid.NewGuid(), userId, CancellationToken.None);
        Assert.Equal(groupId, owner.GroupId);
        Assert.True(owner.IsOwner);
    }

    private static ConductorRoomAuthorizer Build(Guid? groupId, Membership? membership = null)
    {
        var resolver = new FakeEventGroupResolver(groupId);
        var store = new FakeGroupStore(membership);
        return new ConductorRoomAuthorizer(resolver, new GroupAccessService(store));
    }

    private sealed class FakeEventGroupResolver : IEventGroupResolver
    {
        private readonly Guid? _groupId;

        public FakeEventGroupResolver(Guid? groupId)
        {
            _groupId = groupId;
        }

        public Task<Guid?> FindGroupIdByEventIdAsync(Guid eventId, CancellationToken cancellationToken)
            => Task.FromResult(_groupId);
    }

    private sealed class FakeGroupStore : IGroupStore
    {
        private readonly Membership? _membership;

        public FakeGroupStore(Membership? membership)
        {
            _membership = membership;
        }

        public Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<Group?>(Group.Create("Sala", Now, groupId));

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(_membership);

        public Task UpdateAsync(Group group, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task SaveChangesAsync(CancellationToken cancellationToken)
            => throw new NotSupportedException();
    }
}
