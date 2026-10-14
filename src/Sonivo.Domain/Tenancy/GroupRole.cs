namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Canonical permission keys (ADR-0078). A group role holds a subset; the
/// effective permission set is the base membership role's set UNION the custom
/// role's set, so defining roles can only ever widen access, never bypass the
/// Owner/Manager/Member/Viewer invariant.
/// </summary>
public static class GroupPermissions
{
    public const string ManageGroup = "manage_group";
    public const string ManageBranding = "manage_branding";
    public const string ManageMembers = "manage_members";
    public const string ManageRoles = "manage_roles";
    public const string ManageSongs = "manage_songs";
    public const string ManageSetlists = "manage_setlists";
    public const string ManageEvents = "manage_events";
    public const string ManageTasks = "manage_tasks";
    public const string RespondRsvp = "respond_rsvp";
    public const string Practice = "practice";

    /// <summary>Permissions every membership role may hold (safe, non-destructive).</summary>
    public static readonly string[] Assignable =
    {
        ManageSongs,
        ManageSetlists,
        ManageEvents,
        ManageTasks,
        RespondRsvp,
        Practice,
    };

    public static readonly string[] All =
    {
        ManageGroup,
        ManageBranding,
        ManageMembers,
        ManageRoles,
        ManageSongs,
        ManageSetlists,
        ManageEvents,
        ManageTasks,
        RespondRsvp,
        Practice,
    };

    public static bool IsKnown(string? value) => All.Contains(value);
}

/// <summary>
/// Group-defined role (ADR-0078). Built-in roles are seeded from the base
/// membership roles and cannot be deleted; custom roles only carry a permission
/// set and a human name, and are always applied on top of the base role.
/// </summary>
public sealed class GroupRole
{
    public const string SystemOwner = "Owner";
    public const string SystemManager = "Manager";
    public const string SystemMember = "Member";
    public const string SystemViewer = "Viewer";

    public Guid Id { get; private set; }
    public Guid GroupId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    /// <summary>Comma-separated canonical permission keys (see <see cref="GroupPermissions"/>).</summary>
    public string Permissions { get; private set; } = string.Empty;
    public bool IsSystem { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? UpdatedAt { get; private set; }

    private GroupRole()
    {
    }

    public static GroupRole CreateSystem(
        Guid groupId,
        string name,
        DateTimeOffset now,
        string? description = null,
        Guid? id = null)
        => Create(groupId, name, now, Array.Empty<string>(), description, isSystem: true, id: id);

    public static GroupRole Create(
        Guid groupId,
        string name,
        DateTimeOffset now,
        IEnumerable<string> permissions,
        string? description = null,
        bool isSystem = false,
        Guid? id = null)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("GroupId is required.", nameof(groupId));
        }

        var trimmedName = name?.Trim() ?? string.Empty;
        if (trimmedName.Length is < 2 or > 60)
        {
            throw new ArgumentException("Role name must be between 2 and 60 characters.", nameof(name));
        }

        var normalized = (permissions ?? Enumerable.Empty<string>())
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var unknown = normalized.FirstOrDefault(p => !GroupPermissions.IsKnown(p));
        if (unknown is not null)
        {
            throw new ArgumentException($"Unknown permission: {unknown}", nameof(permissions));
        }

        var trimmedDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (trimmedDescription is { Length: > 200 })
        {
            trimmedDescription = trimmedDescription[..200];
        }

        return new GroupRole
        {
            Id = id ?? Guid.NewGuid(),
            GroupId = groupId,
            Name = trimmedName,
            Description = trimmedDescription,
            Permissions = string.Join(',', normalized),
            IsSystem = isSystem,
            CreatedAt = now,
        };
    }

    public IReadOnlyList<string> PermissionList =>
        Permissions.Length == 0
            ? Array.Empty<string>()
            : Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    public bool HasPermission(string permission) =>
        PermissionList.Contains(permission, StringComparer.Ordinal);

    public void Rename(string name)
    {
        if (IsSystem)
        {
            throw new InvalidOperationException("Built-in roles cannot be renamed.");
        }

        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 2 or > 60)
        {
            throw new ArgumentException("Role name must be between 2 and 60 characters.", nameof(name));
        }

        Name = trimmed;
    }

    public void SetPermissions(IEnumerable<string> permissions)
    {
        if (IsSystem)
        {
            throw new InvalidOperationException("Built-in roles cannot be edited.");
        }

        var normalized = (permissions ?? Enumerable.Empty<string>())
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var unknown = normalized.FirstOrDefault(p => !GroupPermissions.IsKnown(p));
        if (unknown is not null)
        {
            throw new ArgumentException($"Unknown permission: {unknown}", nameof(permissions));
        }

        Permissions = string.Join(',', normalized);
    }

    public void SetDescription(string? description)
    {
        if (IsSystem)
        {
            throw new InvalidOperationException("Built-in roles cannot be edited.");
        }

        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim()[..Math.Min(200, description.Trim().Length)];
    }

    public void Touch(DateTimeOffset now) => UpdatedAt = now;
}
