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
            () => authorizer.RequireParticipantAsync(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireConductorAsync(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None));

        await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireParticipantAsync(Guid.Empty, Guid.NewGuid(), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireConductorAsync(Guid.Empty, Guid.NewGuid(), CancellationToken.None));
    }

    [Fact]
    public async Task Non_member_throws_not_found_without_leaking()
    {
        var groupId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var authorizer = Build(groupId, membership: null);

        var memberEx = await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireParticipantAsync(Guid.NewGuid(), userId, CancellationToken.None));
        Assert.Equal("Event not found.", memberEx.Message);

        await Assert.ThrowsAsync<NotFoundException>(
            () => authorizer.RequireConductorAsync(Guid.NewGuid(), userId, CancellationToken.None));
        _ = groupId;
    }

    [Fact]
    public async Task Member_can_join_but_cannot_conduct()
    {
        var userId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var membership = Membership.CreateMember(groupId, userId, Now);
        var authorizer = Build(groupId, membership);

        var access = await authorizer.RequireParticipantAsync(Guid.NewGuid(), userId, CancellationToken.None);
        Assert.Equal(groupId, access.GroupId);
        Assert.False(access.IsOwner);
        Assert.False(access.CanManageContent);

        var forbidden = await Assert.ThrowsAsync<ForbiddenException>(
            () => authorizer.RequireConductorAsync(Guid.NewGuid(), userId, CancellationToken.None));
        Assert.Equal("Permission required: conduct", forbidden.Message);
    }

    [Fact]
    public async Task Manager_can_join_and_conduct()
    {
        var userId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var membership = Membership.CreateMember(groupId, userId, Now);
        membership.AssignRole(MembershipRoles.Manager);
        var authorizer = Build(groupId, membership);

        var access = await authorizer.RequireParticipantAsync(Guid.NewGuid(), userId, CancellationToken.None);
        Assert.False(access.IsOwner);
        Assert.True(access.CanManageContent);

        var conduct = await authorizer.RequireConductorAsync(Guid.NewGuid(), userId, CancellationToken.None);
        Assert.True(conduct.CanManageContent);
    }

    [Fact]
    public async Task Viewer_cannot_join_a_practice_room()
    {
        var userId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var membership = Membership.CreateMember(groupId, userId, Now);
        membership.AssignRole(MembershipRoles.Viewer);
        var authorizer = Build(groupId, membership);

        await Assert.ThrowsAsync<ForbiddenException>(
            () => authorizer.RequireParticipantAsync(Guid.NewGuid(), userId, CancellationToken.None));
    }

    [Fact]
    public async Task Owner_can_join_and_conduct()
    {
        var userId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var membership = Membership.CreateOwner(groupId, userId, Now);
        var authorizer = Build(groupId, membership);

        var member = await authorizer.RequireParticipantAsync(Guid.NewGuid(), userId, CancellationToken.None);
        Assert.True(member.IsOwner);

        var owner = await authorizer.RequireConductorAsync(Guid.NewGuid(), userId, CancellationToken.None);
        Assert.Equal(groupId, owner.GroupId);
        Assert.True(owner.IsOwner);
    }

    [Fact]
    public async Task Event_lookup_selector_is_set_before_resolving_its_group()
    {
        var eventId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var scope = new RecordingDatabaseScope();
        var resolver = new FakeEventGroupResolver(
            groupId,
            () => Assert.Equal(eventId, scope.MemberEventId));
        var authorizer = new ConductorRoomAuthorizer(
            resolver,
            new GroupAccessService(new FakeGroupStore(Membership.CreateMember(groupId, userId, Now)),
                databaseScope: scope),
            scope);

        var result = await authorizer.RequireParticipantAsync(eventId, userId, CancellationToken.None);

        Assert.Equal(groupId, result.GroupId);
        Assert.Equal(eventId, scope.MemberEventId);
        Assert.Equal(groupId, scope.VerifiedGroupId);
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
        private readonly Action? _beforeResolve;

        public FakeEventGroupResolver(Guid? groupId, Action? beforeResolve = null)
        {
            _groupId = groupId;
            _beforeResolve = beforeResolve;
        }

        public Task<Guid?> FindGroupIdByEventIdAsync(Guid eventId, CancellationToken cancellationToken)
        {
            _beforeResolve?.Invoke();
            return Task.FromResult(_groupId);
        }
    }

    private sealed class RecordingDatabaseScope : IGroupDatabaseScope
    {
        public Guid? MemberEventId { get; private set; }
        public Guid? VerifiedGroupId { get; private set; }

        public Task SetAuthenticatedUserAsync(Guid userId, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetMultiGroupReadAsync(Guid userId, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetVerifiedGroupAsync(Guid groupId, CancellationToken cancellationToken)
        {
            VerifiedGroupId = groupId;
            return Task.CompletedTask;
        }

        public Task SetSignedPaymentWebhookGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetGroupForBootstrapAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetInvitationTokenLookupAsync(string tokenHash, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetPublicGroupSlugAsync(string slug, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetAuthenticatedGroupSlugLookupAsync(string slug, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetMemberEventLookupAsync(Guid eventId, CancellationToken cancellationToken)
        {
            MemberEventId = eventId;
            return Task.CompletedTask;
        }

        public Task SetManagedAccountMembershipLookupAsync(
            Guid groupId,
            Guid managedUserId,
            CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetHandleLoginLookupAsync(string slug, string normalizedHandle, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task SetGroupSlugUniquenessLookupAsync(string slug, CancellationToken cancellationToken)
            => Task.CompletedTask;
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
