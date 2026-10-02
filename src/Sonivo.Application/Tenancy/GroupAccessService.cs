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

    /// <summary>Owner or Manager: repertoire, setlists and events (ADR-0051).</summary>
    public async Task<(Group Group, Membership Membership)> RequireManagerAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var (group, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);
        if (!membership.CanManageContent)
        {
            _logger?.LogWarning(
                "Security event: authz denied (manager required). ActorUserId: {ActorUserId}, GroupId: {GroupId}",
                userId,
                groupId);
            throw new ForbiddenException("Manager role required.");
        }

        return (group, membership);
    }

    /// <summary>Owner, Manager or Member: RSVP and practice (a Viewer cannot).</summary>
    public async Task<(Group Group, Membership Membership)> RequireParticipantAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var (group, membership) = await RequireMemberAsync(groupId, userId, cancellationToken);
        if (!membership.CanParticipate)
        {
            _logger?.LogWarning(
                "Security event: authz denied (participant required). ActorUserId: {ActorUserId}, GroupId: {GroupId}",
                userId,
                groupId);
            throw new ForbiddenException("Participant role required.");
        }

        return (group, membership);
    }
}
