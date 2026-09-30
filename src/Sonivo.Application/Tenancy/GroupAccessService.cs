using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed class GroupAccessService
{
    private readonly IGroupStore _store;
    private readonly ILogger<GroupAccessService>? _logger;

    public GroupAccessService(IGroupStore store, ILogger<GroupAccessService>? logger = null)
    {
        _store = store;
        _logger = logger;
    }

    public async Task<(Group Group, Membership Membership)> RequireMemberAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var membership = await _store.GetMembershipAsync(groupId, userId, cancellationToken);
        if (membership is null)
        {
            // Non-member → 404 (do not leak existence).
            throw new NotFoundException("Group not found.");
        }

        var group = await _store.GetByIdAsync(groupId, cancellationToken);
        if (group is null || group.IsDeleted)
        {
            throw new NotFoundException("Group not found.");
        }

        return (group, membership);
    }

    public async Task<(Group Group, Membership Membership)> RequireOwnerAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var (group, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);
        if (!membership.IsOwner)
        {
            // M5 (SECURITY-AUDIT-2026-09): security event logging — identifiers only.
            _logger?.LogWarning(
                "Security event: authz denied (owner required). ActorUserId: {ActorUserId}, GroupId: {GroupId}",
                userId,
                groupId);
            throw new ForbiddenException("Owner role required.");
        }

        return (group, membership);
    }
}
