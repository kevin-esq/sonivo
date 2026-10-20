using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

/// <summary>
/// Per-request authorization for a Group-scoped operation (ADR-0019, ADR-0079).
///
/// Group is the tenant; a User reaches it only through Membership, and every
/// Group-scoped request is re-authorized here from the authenticated principal.
/// A GroupId supplied by the client is a SELECTOR to verify, never a grant.
///
/// ADR-0082: authorization is permission-based. New custom roles replace the
/// non-owner base permission set; legacy additive roles retain that behavior
/// until an Owner explicitly converts them. The Owner remains fixed.
/// </summary>
public sealed class GroupAccessService
{
    private readonly IGroupStore _store;
    private readonly IGroupRoleStore? _roles;
    private readonly IResourceGrantStore? _grants;
    private readonly ILogger<GroupAccessService>? _logger;
    private readonly IGroupDatabaseScope? _databaseScope;

    public GroupAccessService(
        IGroupStore store,
        IGroupRoleStore? roles = null,
        IResourceGrantStore? grants = null,
        ILogger<GroupAccessService>? logger = null,
        IGroupDatabaseScope? databaseScope = null)
    {
        _store = store;
        _roles = roles;
        _grants = grants;
        _logger = logger;
        _databaseScope = databaseScope;
    }

    public async Task<(Group Group, Membership Membership)> RequireMemberAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var membership = await _store.GetMembershipAsync(groupId, userId, cancellationToken);
        if (membership is null || !membership.AccessEnabled)
        {
            // Non-member → 404 (do not leak existence).
            throw new NotFoundException("Group not found.");
        }

        if (_databaseScope is not null)
        {
            await _databaseScope.SetVerifiedGroupAsync(groupId, cancellationToken);
        }

        var group = await _store.GetByIdAsync(groupId, cancellationToken);
        if (group is null || group.IsDeleted)
        {
            throw new NotFoundException("Group not found.");
        }

        return (group, membership);
    }

    /// <summary>
    /// Resolves the effective permission set. Owner always retains the fixed
    /// Owner profile. Members without a custom role use their built-in preset.
    /// Assigned roles must resolve inside this Group; a missing or cross-Group
    /// role fails closed instead of restoring the broader base preset.
    /// </summary>
    private async Task<IReadOnlySet<string>> EffectivePermissionsAsync(
        Membership membership,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        var basePermissions = GroupPermissions.BaseRolePermissions(membership.Role);

        if (membership.IsOwner)
        {
            return GroupPermissions.Expand(basePermissions);
        }

        if (membership.GroupRoleId is not { } roleId)
        {
            return GroupPermissions.Expand(basePermissions);
        }

        if (_roles is null)
        {
            _logger?.LogError(
                "Security event: assigned group role could not be resolved. UserId: {UserId}, GroupId: {GroupId}, GroupRoleId: {GroupRoleId}",
                membership.UserId,
                groupId,
                roleId);
            return new HashSet<string>(StringComparer.Ordinal);
        }

        var granted = await _roles.GetAsync(groupId, roleId, cancellationToken);
        if (granted is null)
        {
            _logger?.LogError(
                "Security event: assigned group role is missing or outside its Group. UserId: {UserId}, GroupId: {GroupId}, GroupRoleId: {GroupRoleId}",
                membership.UserId,
                groupId,
                roleId);
            return new HashSet<string>(StringComparer.Ordinal);
        }

        var effective = new HashSet<string>(
            granted.ExtendsBaseRole ? basePermissions : Array.Empty<string>(),
            StringComparer.Ordinal);
        foreach (var permission in granted.PermissionList)
        {
            if (GroupPermissions.IsAssignable(permission))
            {
                effective.Add(permission);
            }
        }

        // ADR-0082: dependencies are expanded server-side; the profile still
        // cannot include any administrative capability.
        return GroupPermissions.Expand(effective);
    }

    /// <summary>
    /// The permission gate every Group-scoped capability check must go through.
    /// Non-member → 404; member without the permission → 403.
    /// </summary>
    public async Task<(Group Group, Membership Membership)> RequirePermissionAsync(
        Guid groupId,
        Guid userId,
        string permission,
        CancellationToken cancellationToken)
    {
        var (group, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);

        var effective = await EffectivePermissionsAsync(membership, groupId, cancellationToken);
        if (!effective.Contains(permission))
        {
            _logger?.LogWarning(
                "Security event: authz denied (permission required). ActorUserId: {ActorUserId}, GroupId: {GroupId}, Permission: {Permission}",
                userId,
                groupId,
                permission);
            throw new ForbiddenException($"Permission required: {permission}");
        }

        return (group, membership);
    }

    public async Task<bool> HasPermissionAsync(
        Guid groupId,
        Guid userId,
        string permission,
        CancellationToken cancellationToken)
    {
        var (_, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);
        var effective = await EffectivePermissionsAsync(membership, groupId, cancellationToken);
        return effective.Contains(permission);
    }

    /// <summary>
    /// Checks read access to one item without throwing when the member lacks
    /// it. This is used to omit nested data from a response whose parent the
    /// caller may read. Explicit denies still win over role access.
    /// </summary>
    public async Task<bool> HasResourceReadPermissionAsync(
        Guid groupId,
        Guid userId,
        string permission,
        string resourceType,
        Guid resourceId,
        CancellationToken cancellationToken)
    {
        if (!GroupPermissions.IsReadCapability(permission))
        {
            throw new ArgumentException("A read capability is required.", nameof(permission));
        }

        var (_, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);
        var effective = await EffectivePermissionsAsync(membership, groupId, cancellationToken);
        var grant = _grants is null
            ? null
            : await _grants.FindAsync(groupId, userId, resourceType, resourceId, cancellationToken);

        if (grant is not null)
        {
            return grant.Granted;
        }

        return effective.Contains(permission);
    }

    /// <summary>
    /// Checks a path when each domain node has its own read capability (for
    /// example SongView → ArrangementView → ResourceView).
    /// </summary>
    public async Task<bool> HasResourceReadPathPermissionAsync(
        Guid groupId,
        Guid userId,
        IReadOnlyList<(string ResourceType, Guid ResourceId, string Permission)> path,
        CancellationToken cancellationToken)
    {
        if (path.Count == 0)
        {
            throw new ArgumentException("A resource path is required.", nameof(path));
        }

        var (_, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);
        var effective = await EffectivePermissionsAsync(membership, groupId, cancellationToken);
        var inheritedRead = false;
        foreach (var (resourceType, resourceId, permission) in path)
        {
            if (!GroupPermissions.IsReadCapability(permission))
            {
                throw new ArgumentException("Every path capability must be a read capability.", nameof(path));
            }

            var grant = _grants is null
                ? null
                : await _grants.FindAsync(groupId, userId, resourceType, resourceId, cancellationToken);
            var readable = inheritedRead || effective.Contains(permission) || grant is { Granted: true };
            if (grant is { Granted: false } || !readable)
            {
                return false;
            }

            inheritedRead |= grant is { Granted: true };
        }

        return true;
    }

    /// <summary>
    /// Requires every item on a root-to-leaf path. A parent may contribute
    /// inherited read access to descendants, but never inherited write access.
    /// </summary>
    public async Task<(Group Group, Membership Membership)> RequireResourcePathPermissionAsync(
        Guid groupId,
        Guid userId,
        string permission,
        IReadOnlyList<(string ResourceType, Guid ResourceId)> path,
        CancellationToken cancellationToken)
    {
        if (path.Count == 0)
        {
            throw new ArgumentException("A resource path is required.", nameof(path));
        }

        var (group, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);
        var effective = await EffectivePermissionsAsync(membership, groupId, cancellationToken);
        var inheritedRead = false;
        foreach (var (resourceType, resourceId) in path)
        {
            var grant = _grants is null
                ? null
                : await _grants.FindAsync(groupId, userId, resourceType, resourceId, cancellationToken);

            if (GroupPermissions.IsReadCapability(permission))
            {
                if (grant is { Granted: false }
                    || (!inheritedRead && !effective.Contains(permission) && grant is not { Granted: true }))
                {
                    Deny(userId, groupId, permission);
                }

                inheritedRead |= grant is { Granted: true };
                continue;
            }

            if (!effective.Contains(permission) || grant is { Granted: false })
            {
                Deny(userId, groupId, permission);
            }
        }

        return (group, membership);
    }

    /// <summary>Requires a hierarchical read path with node-specific capabilities.</summary>
    public async Task<(Group Group, Membership Membership)> RequireResourceReadPathPermissionAsync(
        Guid groupId,
        Guid userId,
        IReadOnlyList<(string ResourceType, Guid ResourceId, string Permission)> path,
        CancellationToken cancellationToken)
    {
        if (path.Count == 0)
        {
            throw new ArgumentException("A resource path is required.", nameof(path));
        }

        var (group, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);
        var effective = await EffectivePermissionsAsync(membership, groupId, cancellationToken);
        var inheritedRead = false;
        foreach (var (resourceType, resourceId, permission) in path)
        {
            if (!GroupPermissions.IsReadCapability(permission))
            {
                throw new ArgumentException("Every path capability must be a read capability.", nameof(path));
            }

            var grant = _grants is null
                ? null
                : await _grants.FindAsync(groupId, userId, resourceType, resourceId, cancellationToken);
            var readable = inheritedRead || effective.Contains(permission) || grant is { Granted: true };
            if (grant is { Granted: false } || !readable)
            {
                Deny(userId, groupId, permission);
            }

            inheritedRead |= grant is { Granted: true };
        }

        return (group, membership);
    }

    /// <summary>Owner-only capability (ADR-0080: group ownership set).</summary>
    public Task<(Group Group, Membership Membership)> RequireOwnerAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
        => RequirePermissionAsync(groupId, userId, GroupPermissions.ManageGroup, cancellationToken);

    /// <summary>
    /// Content management. Maps to the narrowest content-write capability a
    /// Manager holds and a Member does not, so behaviour is identical to the
    /// previous role-only check for every existing handler.
    /// </summary>
    public Task<(Group Group, Membership Membership)> RequireManagerAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
        => RequirePermissionAsync(groupId, userId, GroupPermissions.ManagerCapability, cancellationToken);

    /// <summary>Owner, Manager or Member: RSVP and practice (a Viewer cannot).</summary>
    public Task<(Group Group, Membership Membership)> RequireParticipantAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
        => RequirePermissionAsync(groupId, userId, GroupPermissions.EventRespondRsvp, cancellationToken);

    /// <summary>
    /// The per-resource gate (ADR-0080): the same capability check as
    /// <see cref="RequirePermissionAsync"/>, narrowed to one specific item.
    ///
    /// Rules, and why they are shaped this way:
    /// - READ  requires the role capability OR an explicit `allow` row, so a
    ///   grant can ADD visibility a role would not give (a Viewer who may open
    ///   one song).
    /// - WRITE requires the role capability AND NOT an explicit `deny` row, so a
    ///   grant can only ever REMOVE access. There is no way to escalate by
    ///   adding a row.
    ///
    /// The grant store is optional; when it is absent the check degenerates to
    /// the plain capability gate, which is exactly the pre-ADR-0080 behaviour.
    /// </summary>
    public async Task<(Group Group, Membership Membership)> RequireResourcePermissionAsync(
        Guid groupId,
        Guid userId,
        string permission,
        string resourceType,
        Guid resourceId,
        CancellationToken cancellationToken)
    {
        var (group, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);

        var effective = await EffectivePermissionsAsync(membership, groupId, cancellationToken);
        var held = effective.Contains(permission);
        var grant = _grants is null
            ? null
            : await _grants.FindAsync(groupId, userId, resourceType, resourceId, cancellationToken);

        if (GroupPermissions.IsReadCapability(permission))
        {
            if (grant is { Granted: false })
            {
                Deny(userId, groupId, permission);
            }

            if (held || grant is { Granted: true })
            {
                return (group, membership);
            }

            Deny(userId, groupId, permission);
        }

        // Per-resource allows are only valid for reads. Writes require the
        // role capability, and a per-resource deny can narrow that capability.
        if (!held || grant is { Granted: false })
        {
            Deny(userId, groupId, permission);
        }

        return (group, membership);
    }

    /// <summary>
    /// The ids of one member's explicitly DENIED items of a kind, for list
    /// filtering (ADR-0080). A row only exists when somebody overrode the item,
    /// so an empty result means "the role governs every row" — the common case,
    /// which costs no extra query.
    /// </summary>
    public async Task<IReadOnlySet<Guid>> DeniedResourceIdsAsync(
        Guid groupId,
        Guid userId,
        string resourceType,
        CancellationToken cancellationToken)
    {
        if (_grants is null)
        {
            return new HashSet<Guid>();
        }

        var rows = await _grants.ListForUserAsync(groupId, userId, cancellationToken);
        return rows
            .Where(g => g.ResourceType == resourceType && !g.Granted)
            .Select(g => g.ResourceId)
            .ToHashSet();
    }

    /// <summary>Explicitly allowed item ids for members without group-wide read.</summary>
    public async Task<IReadOnlySet<Guid>> GrantedResourceIdsAsync(
        Guid groupId,
        Guid userId,
        string resourceType,
        CancellationToken cancellationToken)
    {
        if (_grants is null)
        {
            return new HashSet<Guid>();
        }

        var rows = await _grants.ListForUserAsync(groupId, userId, cancellationToken);
        return rows
            .Where(g => g.ResourceType == resourceType && g.Granted)
            .Select(g => g.ResourceId)
            .ToHashSet();
    }

    private void Deny(Guid userId, Guid groupId, string permission)
    {
        _logger?.LogWarning(
            "Security event: authz denied (resource permission). ActorUserId: {ActorUserId}, GroupId: {GroupId}, Permission: {Permission}",
            userId,
            groupId,
            permission);
        throw new ForbiddenException($"Permission required: {permission}");
    }
}
