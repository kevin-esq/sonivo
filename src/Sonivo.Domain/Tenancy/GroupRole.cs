namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Group-defined role (ADR-0082). Built-in roles are seeded from the base
/// membership roles and cannot be deleted; custom roles carry an explicit
/// permission profile and a human name. New roles replace the base capability
/// preset; migrated roles may retain legacy additive behavior. Owner-only
/// access stays fixed.
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
    /// <summary>Legacy compatibility: true extends the built-in preset instead of replacing it.</summary>
    public bool ExtendsBaseRole { get; private set; }
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
        Guid? id = null,
        bool extendsBaseRole = false)
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

        // Administrative and ownership capabilities would let a custom profile
        // escalate, so they are refused here. The domain is the single place
        // that enforces this invariant — the API surfaces failures as 400.
        var notAssignable = normalized.FirstOrDefault(p => !GroupPermissions.IsAssignable(p));
        if (notAssignable is not null)
        {
            throw new ArgumentException(
                $"Permission cannot be granted to a custom role: {notAssignable}",
                nameof(permissions));
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
            ExtendsBaseRole = extendsBaseRole,
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

    public void SetExtendsBaseRole(bool extendsBaseRole)
    {
        if (IsSystem)
        {
            throw new InvalidOperationException("Built-in roles cannot change their permission mode.");
        }

        ExtendsBaseRole = extendsBaseRole;
    }

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

        var notAssignable = normalized.FirstOrDefault(p => !GroupPermissions.IsAssignable(p));
        if (notAssignable is not null)
        {
            throw new ArgumentException(
                $"Permission cannot be granted to a custom role: {notAssignable}",
                nameof(permissions));
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
