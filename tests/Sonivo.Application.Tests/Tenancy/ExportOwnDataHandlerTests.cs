using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Tests.Tenancy;

public sealed class ExportOwnDataHandlerTests
{
    [Fact]
    public async Task HandleAsync_sets_multi_group_scope_for_authenticated_user()
    {
        var userId = Guid.NewGuid();
        var scope = new RecordingGroupDatabaseScope();
        var handler = new ExportOwnDataHandler(
            new EmptyGroupStore(),
            new EmptyAccountAuditStore(),
            new FixedClock(),
            scope);

        await handler.HandleAsync(
            new ExportOwnDataQuery(userId, null, null, false, false, null),
            CancellationToken.None);

        Assert.Equal(userId, scope.MultiGroupUserId);
    }

    [Fact]
    public async Task HandleAsync_rejects_empty_user_before_setting_scope()
    {
        var scope = new RecordingGroupDatabaseScope();
        var handler = new ExportOwnDataHandler(
            new EmptyGroupStore(),
            new EmptyAccountAuditStore(),
            new FixedClock(),
            scope);

        await Assert.ThrowsAsync<ValidationException>(() => handler.HandleAsync(
            new ExportOwnDataQuery(Guid.Empty, null, null, false, false, null),
            CancellationToken.None));

        Assert.Null(scope.MultiGroupUserId);
    }

    private sealed class RecordingGroupDatabaseScope : IGroupDatabaseScope
    {
        public Guid? MultiGroupUserId { get; private set; }

        public Task SetAuthenticatedUserAsync(Guid userId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetMultiGroupReadAsync(Guid userId, CancellationToken cancellationToken)
        {
            MultiGroupUserId = userId;
            return Task.CompletedTask;
        }
        public Task SetVerifiedGroupAsync(Guid groupId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetSignedPaymentWebhookGroupAsync(Guid groupId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetGroupForBootstrapAsync(Guid groupId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetInvitationTokenLookupAsync(string tokenHash, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetPublicGroupSlugAsync(string slug, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetAuthenticatedGroupSlugLookupAsync(string slug, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetMemberEventLookupAsync(Guid eventId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetManagedAccountMembershipLookupAsync(
            Guid groupId,
            Guid managedUserId,
            CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetHandleLoginLookupAsync(string slug, string normalizedHandle, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SetGroupSlugUniquenessLookupAsync(string slug, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class EmptyGroupStore : IGroupStore
    {
        public Task AddAsync(Sonivo.Domain.Tenancy.Group group, Sonivo.Domain.Tenancy.Membership ownerMembership, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task AddMembershipAsync(Sonivo.Domain.Tenancy.Membership membership, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<GroupListItem>>([]);
        public Task<Sonivo.Domain.Tenancy.Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken) => Task.FromResult<Sonivo.Domain.Tenancy.Group?>(null);
        public Task<Sonivo.Domain.Tenancy.Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken) => Task.FromResult<Sonivo.Domain.Tenancy.Membership?>(null);
        public Task UpdateAsync(Sonivo.Domain.Tenancy.Group group, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class EmptyAccountAuditStore : IAccountAuditStore
    {
        public Task AddAsync(Sonivo.Domain.Tenancy.AccountAudit entry, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow => DateTimeOffset.UnixEpoch;
    }
}
