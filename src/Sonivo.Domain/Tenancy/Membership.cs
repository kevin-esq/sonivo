namespace Sonivo.Domain.Tenancy;

/// <summary>
/// A person's place in a group (ADR-0046; roles per ADR-0051). The row always
/// exists; the Identity account is optional — <see cref="UserId"/> is null for a
/// roster-only person who has no access yet. CHECK (Role='Owner' ⇒ UserId IS NOT
/// NULL) is enforced in the database and in <see cref="AssignRole"/>. The role
/// drives section permissions; the optional musical role is descriptive only.
/// </summary>
public sealed class Membership
{
    public const int MusicalRoleMaxLength = 64;
    public const int DisplayNameMaxLength = 200;

    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public Guid? UserId { get; private set; }
    public string Role { get; private set; } = string.Empty;

    /// <summary>Person name; required for roster-only rows, optional otherwise.</summary>
    public string? DisplayName { get; private set; }

    /// <summary>
    /// Optional login handle (ADR-0047), unique per group and stored separately
    /// from the GroupId. Used by members without an email to sign in as
    /// <c>handle@slug</c>. Null when the person has no handle.
    /// </summary>
    public string? Handle { get; private set; }

    /// <summary>Optional musical role (e.g. "voz", "bajo"): descriptive, never authorizes.</summary>
    public string? MusicalRole { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public Group? Group { get; private set; }

    private Membership()
    {
    }

    public static Membership CreateOwner(Guid groupId, Guid userId, DateTimeOffset now, Guid? id = null)
        => Create(groupId, userId, MembershipRoles.Owner, now, id);

    public static Membership CreateMember(Guid groupId, Guid userId, DateTimeOffset now, Guid? id = null)
        => Create(groupId, userId, MembershipRoles.Member, now, id);

    /// <summary>Roster-only person: no Identity account, never counts as access.</summary>
    public static Membership CreatePerson(
        Guid groupId,
        string displayName,
        DateTimeOffset now,
        Guid? id = null)
    {
        var name = NormalizeDisplayName(displayName);
        return new Membership
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            UserId = null,
            Role = MembershipRoles.Member,
            DisplayName = name,
            CreatedAt = now
        };
    }

    public bool IsOwner => Role == MembershipRoles.Owner;

    public bool IsManager => Role == MembershipRoles.Manager;

    public bool IsViewer => Role == MembershipRoles.Viewer;

    /// <summary>A roster row without an account is a person, never a member with access.</summary>
    public bool HasAccess => UserId is not null;

    /// <summary>Owner or Manager: content management (repertoire, setlists, events).</summary>
    public bool CanManageContent => MembershipRoles.CanManageContent(Role);

    /// <summary>Owner, Manager or Member: RSVP and practice participation.</summary>
    public bool CanParticipate => MembershipRoles.CanParticipate(Role);

    public void AssignRole(string role)
    {
        if (!MembershipRoles.IsValid(role))
        {
            throw new ArgumentException(
                $"Role must be one of {string.Join(", ", MembershipRoles.All)}.", nameof(role));
        }

        if (role == MembershipRoles.Owner && UserId is null)
        {
            throw new ArgumentException("An Owner must have an account.", nameof(role));
        }

        Role = role;
    }

    /// <summary>Links the roster row to an Identity account (claim / link).</summary>
    public void ClaimAccount(Guid userId)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("UserId is required.", nameof(userId));
        }

        UserId = userId;
    }

    /// <summary>Assigns a validated login handle, or clears it when null.</summary>
    public void AssignHandle(string? handle)
    {
        var normalized = MembershipHandles.Normalize(handle);
        if (normalized is null)
        {
            Handle = null;
            return;
        }

        if (!MembershipHandles.IsValid(normalized))
        {
            throw new ArgumentException(
                $"Handle must match [a-z0-9._-]{{{MembershipHandles.MinLength},{MembershipHandles.MaxLength}}}.",
                nameof(handle));
        }

        Handle = normalized;
    }

    /// <summary>Sets or clears the descriptive musical role.</summary>
    public void SetMusicalRole(string? musicalRole)
    {
        if (string.IsNullOrWhiteSpace(musicalRole))
        {
            MusicalRole = null;
            return;
        }

        var trimmed = musicalRole.Trim();
        if (trimmed.Length > MusicalRoleMaxLength)
        {
            throw new ArgumentException(
                $"Musical role must be {MusicalRoleMaxLength} characters or fewer.", nameof(musicalRole));
        }

        MusicalRole = trimmed;
    }

    private static Membership Create(
        Guid groupId,
        Guid userId,
        string role,
        DateTimeOffset now,
        Guid? id)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("GroupId is required.", nameof(groupId));
        }

        if (userId == Guid.Empty)
        {
            throw new ArgumentException("UserId is required.", nameof(userId));
        }

        if (!MembershipRoles.IsValid(role))
        {
            throw new ArgumentException(
                $"Role must be one of {string.Join(", ", MembershipRoles.All)}.", nameof(role));
        }

        return new Membership
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            UserId = userId,
            Role = role,
            CreatedAt = now
        };
    }

    private static string NormalizeDisplayName(string displayName)
    {
        if (string.IsNullOrWhiteSpace(displayName))
        {
            throw new ArgumentException("Display name is required.", nameof(displayName));
        }

        var trimmed = displayName.Trim();
        if (trimmed.Length > DisplayNameMaxLength)
        {
            throw new ArgumentException("Display name must be 200 characters or fewer.", nameof(displayName));
        }

        return trimmed;
    }
}
