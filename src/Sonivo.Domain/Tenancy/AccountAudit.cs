namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Append-only audit of managed-account operations (ADR-0047). Stores **ids only**,
/// never personal content.
/// </summary>
public sealed class AccountAudit
{
    public const string ActionAccessCreated = "access_created";
    public const string ActionAccessReset = "access_reset";
    public const string ActionLinked = "linked";
    public const string ActionRemoved = "removed";
    public const string ActionPasswordChanged = "password_changed";
    public const string ActionOwnerTransferred = "owner_transferred";
    // SECURITY-AUDIT-2026-10 (A4): passkey lifecycle is audited like every other
    // credential change (string column — no schema migration needed).
    public const string ActionPasskeyAdded = "passkey_added";
    public const string ActionPasskeyRemoved = "passkey_removed";

    public Guid Id { get; private set; }
    public Guid? ActorUserId { get; private set; }
    public Guid? TargetUserId { get; private set; }
    public Guid? GroupId { get; private set; }
    public string Action { get; private set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; private set; }

    private AccountAudit()
    {
    }

    public static AccountAudit Create(
        string action,
        DateTimeOffset now,
        Guid? actorUserId = null,
        Guid? targetUserId = null,
        Guid? groupId = null,
        Guid? id = null)
    {
        if (string.IsNullOrWhiteSpace(action))
        {
            throw new ArgumentException("Action is required.", nameof(action));
        }

        return new AccountAudit
        {
            Id = id ?? Guid.NewGuid(),
            Action = action.Trim(),
            ActorUserId = actorUserId,
            TargetUserId = targetUserId,
            GroupId = groupId,
            CreatedAt = now
        };
    }
}
