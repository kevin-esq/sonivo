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
    public const string ActionMemberAccessDisabled = "member_access_disabled";
    public const string ActionMemberAccessEnabled = "member_access_enabled";
    public const string ActionMemberLeft = "member_left";
    public const string ActionInvitationCreated = "invitation_created";
    public const string ActionInvitationRevoked = "invitation_revoked";
    public const string ActionMemberDescriptionChanged = "member_description_changed";
    public const string ActionGroupRoleCreated = "group_role_created";
    public const string ActionGroupRoleUpdated = "group_role_updated";
    public const string ActionGroupRoleDeleted = "group_role_deleted";
    public const string ActionGroupRoleAssigned = "group_role_assigned";
    public const string ActionResourceGrantChanged = "resource_grant_changed";
    public const string ActionGroupReportExported = "group_report_exported";
    public const string ActionTaskCreated = "task_created";
    public const string ActionTaskUpdated = "task_updated";
    public const string ActionTaskStatusChanged = "task_status_changed";
    public const string ActionTaskDeleted = "task_deleted";
    public const string ActionSongCreated = "song_created";
    public const string ActionSongUpdated = "song_updated";
    public const string ActionSongDeleted = "song_deleted";
    public const string ActionArrangementCreated = "arrangement_created";
    public const string ActionArrangementUpdated = "arrangement_updated";
    public const string ActionArrangementDeleted = "arrangement_deleted";

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
