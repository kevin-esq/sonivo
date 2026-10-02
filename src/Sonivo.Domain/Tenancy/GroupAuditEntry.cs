namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Append-only per-group audit log (ADR-0051). Stores ids and short action
/// metadata only — never personal content. Group-scoped: a non-member never
/// reads it.
/// </summary>
public sealed class GroupAuditEntry
{
    public const string ActionRoleChanged = "role_changed";
    public const string ActionMusicalRoleChanged = "musical_role_changed";
    public const string ActionMemberRemoved = "member_removed";
    public const string ActionMemberLeft = "member_left";
    public const string ActionInvitationCreated = "invitation_created";
    public const string ActionInvitationRevoked = "invitation_revoked";

    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public Guid? ActorUserId { get; private set; }
    public Guid? TargetUserId { get; private set; }
    public string Action { get; private set; } = string.Empty;
    /// <summary>Short, non-personal detail (e.g. the new role). Never free text from users.</summary>
    public string? Metadata { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    private GroupAuditEntry()
    {
    }

    public static GroupAuditEntry Create(
        Guid groupId,
        string action,
        DateTimeOffset now,
        Guid? actorUserId = null,
        Guid? targetUserId = null,
        string? metadata = null,
        Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("GroupId is required.", nameof(groupId));
        }

        if (string.IsNullOrWhiteSpace(action))
        {
            throw new ArgumentException("Action is required.", nameof(action));
        }

        var trimmedMetadata = string.IsNullOrWhiteSpace(metadata) ? null : metadata.Trim();
        if (trimmedMetadata is { Length: > 200 })
        {
            trimmedMetadata = trimmedMetadata[..200];
        }

        return new GroupAuditEntry
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            ActorUserId = actorUserId,
            TargetUserId = targetUserId,
            Action = action.Trim(),
            Metadata = trimmedMetadata,
            CreatedAt = now
        };
    }
}
