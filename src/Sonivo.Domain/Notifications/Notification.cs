namespace Sonivo.Domain.Notifications;

/// <summary>Which inbox a notification belongs to.</summary>
public enum NotificationScope
{
    /// <summary>Account-wide (security / credentials). One user.</summary>
    Account = 0,

    /// <summary>Group-scoped (membership, repertoire, scheduling). One group.</summary>
    Group = 1,
}

/// <summary>
/// In-app notification (ADR-0077). Stores a short machine <see cref="Kind"/> and
/// non-personal metadata only — the client maps the kind to localized copy, so no
/// user-facing string is persisted (language policy).
///
/// The two scopes are deliberately separate: an <see cref="NotificationScope.Account"/>
/// notification (sign-in, password, passkey) is never mixed with a
/// <see cref="NotificationScope.Group"/> one (role change, invitation, event).
/// </summary>
public sealed class Notification
{
    public const string KindRoleChanged = "role_changed";
    public const string KindInvitationCreated = "invitation_created";
    public const string KindEventCreated = "event_created";
    public const string KindTaskAssigned = "task_assigned";
    public const string KindPasswordChanged = "password_changed";
    public const string KindPasskeyAdded = "passkey_added";
    public const string KindPasskeyRemoved = "passkey_removed";

    public Guid Id { get; private set; }
    /// <summary>Recipient.</summary>
    public Guid UserId { get; private set; }
    public NotificationScope Scope { get; private set; }
    public Guid? GroupId { get; private set; }
    public Guid? ActorUserId { get; private set; }
    public string Kind { get; private set; } = string.Empty;
    /// <summary>Short, non-personal detail (e.g. the new role). Never user free text.</summary>
    public string? Metadata { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? ReadAt { get; private set; }

    private Notification()
    {
    }

    public static Notification Create(
        Guid userId,
        NotificationScope scope,
        string kind,
        DateTimeOffset now,
        Guid? groupId = null,
        Guid? actorUserId = null,
        string? metadata = null,
        Guid? id = null)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("UserId is required.", nameof(userId));
        }

        if (string.IsNullOrWhiteSpace(kind))
        {
            throw new ArgumentException("Kind is required.", nameof(kind));
        }

        if (scope == NotificationScope.Group && (groupId is null || groupId == Guid.Empty))
        {
            throw new ArgumentException("GroupId is required for group notifications.", nameof(groupId));
        }

        var trimmedMetadata = string.IsNullOrWhiteSpace(metadata) ? null : metadata.Trim();
        if (trimmedMetadata is { Length: > 200 })
        {
            trimmedMetadata = trimmedMetadata[..200];
        }

        return new Notification
        {
            Id = id ?? Guid.NewGuid(),
            UserId = userId,
            Scope = scope,
            GroupId = groupId,
            ActorUserId = actorUserId,
            Kind = kind.Trim(),
            Metadata = trimmedMetadata,
            CreatedAt = now,
        };
    }

    public void MarkRead(DateTimeOffset now)
    {
        ReadAt ??= now;
    }
}
