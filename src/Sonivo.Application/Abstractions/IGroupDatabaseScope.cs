namespace Sonivo.Application.Abstractions;

/// <summary>
/// Sets transaction-local PostgreSQL RLS selectors for a bounded operation,
/// after its principal or single-use capability has been validated. This is a
/// database boundary, not application authorization or an ambient Group.
/// </summary>
public interface IGroupDatabaseScope
{
    Task SetAuthenticatedUserAsync(Guid userId, CancellationToken cancellationToken);
    Task SetMultiGroupReadAsync(Guid userId, CancellationToken cancellationToken);
    Task SetVerifiedGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task SetSignedPaymentWebhookGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task SetGroupForBootstrapAsync(Guid groupId, CancellationToken cancellationToken);
    Task SetInvitationTokenLookupAsync(string tokenHash, CancellationToken cancellationToken);
    Task SetPublicGroupSlugAsync(string slug, CancellationToken cancellationToken);
    Task SetAuthenticatedGroupSlugLookupAsync(string slug, CancellationToken cancellationToken);
    Task SetMemberEventLookupAsync(Guid eventId, CancellationToken cancellationToken);
    Task SetManagedAccountMembershipLookupAsync(
        Guid groupId,
        Guid managedUserId,
        CancellationToken cancellationToken);
    Task SetHandleLoginLookupAsync(string slug, string normalizedHandle, CancellationToken cancellationToken);
    Task SetGroupSlugUniquenessLookupAsync(string slug, CancellationToken cancellationToken);
}
