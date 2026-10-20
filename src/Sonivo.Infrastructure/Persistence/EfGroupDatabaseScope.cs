using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

/// <summary>
/// Carries bounded user, Group, bootstrap, or invitation lookup selectors into
/// the current PostgreSQL transaction for RLS. Values never live at connection
/// scope.
/// </summary>
public sealed class EfGroupDatabaseScope : IGroupDatabaseScope
{
    private readonly SonivoDbContext _db;

    public EfGroupDatabaseScope(SonivoDbContext db)
    {
        _db = db;
    }

    public Task SetAuthenticatedUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("Authenticated user id is required.", nameof(userId));
        }

        return SetLocalAsync("sonivo.user_id", userId, cancellationToken);
    }

    public Task SetMultiGroupReadAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("Authenticated user id is required.", nameof(userId));
        }

        return SetLocalAsync("sonivo.multi_group_user_id", userId, cancellationToken);
    }

    public Task SetVerifiedGroupAsync(Guid groupId, CancellationToken cancellationToken)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Verified Group id is required.", nameof(groupId));
        }

        return SetLocalAsync("sonivo.group_id", groupId, cancellationToken);
    }

    public Task SetSignedPaymentWebhookGroupAsync(Guid groupId, CancellationToken cancellationToken)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Signed payment webhook Group id is required.", nameof(groupId));
        }

        return SetLocalAsync("sonivo.payment_webhook_group_id", groupId, cancellationToken);
    }

    public Task SetGroupForBootstrapAsync(Guid groupId, CancellationToken cancellationToken)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Group id is required.", nameof(groupId));
        }

        return SetLocalAsync("sonivo.bootstrap_group_id", groupId, cancellationToken);
    }

    public Task SetInvitationTokenLookupAsync(string tokenHash, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(tokenHash);
        if (tokenHash.Length != 64 || tokenHash.Any(character => !Uri.IsHexDigit(character)))
        {
            throw new ArgumentException("Invitation token hash is invalid.", nameof(tokenHash));
        }

        return SetLocalAsync("sonivo.invitation_token_hash", tokenHash.ToUpperInvariant(), cancellationToken);
    }

    public Task SetPublicGroupSlugAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = slug.Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(normalized))
        {
            throw new ArgumentException("Group slug is invalid.", nameof(slug));
        }

        return SetLocalAsync("sonivo.public_group_slug", normalized, cancellationToken);
    }

    public Task SetAuthenticatedGroupSlugLookupAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = slug.Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(normalized))
        {
            throw new ArgumentException("Group slug is invalid.", nameof(slug));
        }

        return SetLocalAsync("sonivo.member_group_slug", normalized, cancellationToken);
    }

    public Task SetMemberEventLookupAsync(Guid eventId, CancellationToken cancellationToken)
    {
        if (eventId == Guid.Empty)
        {
            throw new ArgumentException("Event id is required.", nameof(eventId));
        }

        return SetLocalAsync("sonivo.member_event_id", eventId, cancellationToken);
    }

    public async Task SetManagedAccountMembershipLookupAsync(
        Guid groupId,
        Guid managedUserId,
        CancellationToken cancellationToken)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("Verified Group id is required.", nameof(groupId));
        }

        if (managedUserId == Guid.Empty)
        {
            throw new ArgumentException("Managed account user id is required.", nameof(managedUserId));
        }

        await SetLocalAsync("sonivo.managed_account_group_id", groupId, cancellationToken);
        await SetLocalAsync("sonivo.managed_account_user_id", managedUserId, cancellationToken);
    }

    public Task SetHandleLoginLookupAsync(
        string slug,
        string normalizedHandle,
        CancellationToken cancellationToken)
    {
        var normalizedSlug = slug.Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(normalizedSlug)
            || !string.Equals(
                MembershipHandles.Normalize(normalizedHandle),
                normalizedHandle,
                StringComparison.Ordinal))
        {
            throw new ArgumentException("Handle login lookup is invalid.");
        }

        return SetLocalAsync(
            "sonivo.handle_group_slug",
            normalizedSlug,
            cancellationToken,
            async () => await SetLocalAsync(
                "sonivo.handle_value",
                normalizedHandle,
                cancellationToken));
    }

    public Task SetGroupSlugUniquenessLookupAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = slug.Trim().ToLowerInvariant();
        if (!GroupSlug.IsValid(normalized))
        {
            throw new ArgumentException("Group slug is invalid.", nameof(slug));
        }

        return SetLocalAsync("sonivo.group_slug_lookup", normalized, cancellationToken);
    }

    private Task SetLocalAsync(string setting, Guid value, CancellationToken cancellationToken)
    {
        if (!string.Equals(
                _db.Database.ProviderName,
                "Npgsql.EntityFrameworkCore.PostgreSQL",
                StringComparison.Ordinal))
        {
            return Task.CompletedTask;
        }

        if (_db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException(
                "PostgreSQL RLS context requires an active transaction.");
        }

        return _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT set_config({setting}, {value.ToString("D")}, true)",
            cancellationToken);
    }

    private Task SetLocalAsync(
        string setting,
        string value,
        CancellationToken cancellationToken,
        Func<Task>? afterSet = null)
    {
        if (!string.Equals(
                _db.Database.ProviderName,
                "Npgsql.EntityFrameworkCore.PostgreSQL",
                StringComparison.Ordinal))
        {
            return Task.CompletedTask;
        }

        if (_db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException(
                "PostgreSQL RLS context requires an active transaction.");
        }

        return SetLocalTextCoreAsync(setting, value, cancellationToken, afterSet);
    }

    private async Task SetLocalTextCoreAsync(
        string setting,
        string value,
        CancellationToken cancellationToken,
        Func<Task>? afterSet)
    {
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT set_config({setting}, {value}, true)",
            cancellationToken);
        if (afterSet is not null)
        {
            await afterSet();
        }
    }
}
