namespace Sonivo.Domain.Tenancy;

/// <summary>
/// A per-item permission override (ADR-0082/0085).
///
/// The role-level capability set answers "what KIND of thing can this person
/// do". This answers "which specific items", which is the other half of a real
/// permission system: a group may want someone who can see three songs but not
/// the fourth, or a manager who must not touch one particular setlist.
///
/// Resolution (see <see cref="GroupAccessService"/>):
/// - READ  of an item requires the role capability OR an explicit grant row.
/// - WRITE of an item requires the role capability AND NOT an explicit deny row.
///
/// Consequences, deliberately:
/// - A grant can ADD read access a role would not give (a Viewer who may see
///   one song).
/// - A deny can only ever REMOVE access; it can never grant anything, so it
///   cannot be used to escalate.
/// - Both directions are scoped to (GroupId, UserId), so a row can never reach
///   across groups.
/// </summary>
public sealed class ResourceGrant
{
    /// <summary>Canonical resource kinds currently supported for item overrides.</summary>
    public static class ResourceTypes
    {
        public const string Song = "song";
        public const string Arrangement = "arrangement";
        public const string Resource = "resource";

        public static readonly string[] All = { Song, Arrangement, Resource };

        public static bool IsKnown(string? value) => All.Contains(value);
    }

    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    /// <summary>The member the grant applies to (a User id, never a role).</summary>
    public Guid UserId { get; private set; }
    /// <summary>One of <see cref="ResourceTypes"/>.</summary>
    public string ResourceType { get; private set; } = string.Empty;
    public Guid ResourceId { get; private set; }
    /// <summary>True = explicitly allow reading it; false = explicitly forbid.</summary>
    public bool Granted { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public Guid? GrantedByUserId { get; private set; }

    private ResourceGrant()
    {
    }

    public static ResourceGrant Create(
        Guid groupId,
        Guid userId,
        string resourceType,
        Guid resourceId,
        bool granted,
        DateTimeOffset now,
        Guid? grantedByUserId = null,
        Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("GroupId is required.", nameof(groupId));
        }

        if (userId == Guid.Empty)
        {
            throw new ArgumentException("UserId is required.", nameof(userId));
        }

        if (resourceId == Guid.Empty)
        {
            throw new ArgumentException("ResourceId is required.", nameof(resourceId));
        }

        var normalized = resourceType?.Trim().ToLowerInvariant() ?? string.Empty;
        if (!ResourceTypes.IsKnown(normalized))
        {
            throw new ArgumentException($"Unknown resource type: {resourceType}", nameof(resourceType));
        }

        return new ResourceGrant
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            UserId = userId,
            ResourceType = normalized,
            ResourceId = resourceId,
            Granted = granted,
            CreatedAt = now,
            GrantedByUserId = grantedByUserId,
        };
    }
}
