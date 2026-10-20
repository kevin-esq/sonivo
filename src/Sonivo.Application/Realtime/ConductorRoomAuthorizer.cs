using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Realtime;

public sealed record ConductorRoomAccess(Guid GroupId, bool IsOwner, bool CanManageContent);

/// <summary>
/// Per-method Membership recheck for the Q9 conductor Hub (ADR-0036, ADR-0019).
/// The Group is always resolved server-side from the Event id — never from a
/// client-supplied group id. Unknown Event or non-member → 404 (no leak);
/// member non-manager attempting to conduct → 403.
/// </summary>
public sealed class ConductorRoomAuthorizer
{
    private readonly IEventGroupResolver _events;
    private readonly GroupAccessService _access;
    private readonly IGroupDatabaseScope? _databaseScope;

    public ConductorRoomAuthorizer(
        IEventGroupResolver events,
        GroupAccessService access,
        IGroupDatabaseScope? databaseScope = null)
    {
        _events = events;
        _access = access;
        _databaseScope = databaseScope;
    }

    public async Task<ConductorRoomAccess> RequireParticipantAsync(
        Guid eventId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var groupId = await RequireGroupIdAsync(eventId, cancellationToken);
        try
        {
            var (_, membership) = await _access.RequireParticipantAsync(groupId, userId, cancellationToken);
            var canManageContent = await _access.HasPermissionAsync(
                groupId, userId, GroupPermissions.SongEdit, cancellationToken);
            return new ConductorRoomAccess(groupId, membership.IsOwner, canManageContent);
        }
        catch (NotFoundException)
        {
            // Non-member (or vanished group) → same 404 as unknown Event: no leak.
            throw new NotFoundException("Event not found.");
        }
    }

    public async Task<ConductorRoomAccess> RequireConductorAsync(
        Guid eventId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var groupId = await RequireGroupIdAsync(eventId, cancellationToken);
        try
        {
            var (_, membership) = await _access.RequirePermissionAsync(
                groupId, userId, GroupPermissions.Conduct, cancellationToken);
            var canManageContent = await _access.HasPermissionAsync(
                groupId, userId, GroupPermissions.SongEdit, cancellationToken);
            return new ConductorRoomAccess(groupId, membership.IsOwner, canManageContent);
        }
        catch (NotFoundException)
        {
            throw new NotFoundException("Event not found.");
        }
    }

    private async Task<Guid> RequireGroupIdAsync(Guid eventId, CancellationToken cancellationToken)
    {
        if (eventId == Guid.Empty)
        {
            throw new NotFoundException("Event not found.");
        }

        if (_databaseScope is not null)
        {
            await _databaseScope.SetMemberEventLookupAsync(eventId, cancellationToken);
        }

        var groupId = await _events.FindGroupIdByEventIdAsync(eventId, cancellationToken);
        if (groupId is null)
        {
            throw new NotFoundException("Event not found.");
        }

        return groupId.Value;
    }
}
