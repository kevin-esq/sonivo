using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;

namespace Sonivo.Application.Realtime;

public sealed record ConductorRoomAccess(Guid GroupId, bool IsOwner);

/// <summary>
/// Per-method Membership recheck for the Q9 conductor Hub (ADR-0036, ADR-0019).
/// The Group is always resolved server-side from the Event id — never from a
/// client-supplied group id. Unknown Event or non-member → 404 (no leak);
/// member non-Owner attempting to conduct → 403.
/// </summary>
public sealed class ConductorRoomAuthorizer
{
    private readonly IEventGroupResolver _events;
    private readonly GroupAccessService _access;

    public ConductorRoomAuthorizer(IEventGroupResolver events, GroupAccessService access)
    {
        _events = events;
        _access = access;
    }

    public async Task<ConductorRoomAccess> RequireMemberAsync(
        Guid eventId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var groupId = await RequireGroupIdAsync(eventId, cancellationToken);
        try
        {
            var (_, membership) = await _access.RequireMemberAsync(groupId, userId, cancellationToken);
            return new ConductorRoomAccess(groupId, membership.IsOwner);
        }
        catch (NotFoundException)
        {
            // Non-member (or vanished group) → same 404 as unknown Event: no leak.
            throw new NotFoundException("Event not found.");
        }
    }

    public async Task<ConductorRoomAccess> RequireOwnerAsync(
        Guid eventId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var groupId = await RequireGroupIdAsync(eventId, cancellationToken);
        try
        {
            var (_, membership) = await _access.RequireOwnerAsync(groupId, userId, cancellationToken);
            return new ConductorRoomAccess(groupId, membership.IsOwner);
        }
        catch (NotFoundException)
        {
            throw new NotFoundException("Event not found.");
        }
    }

    private async Task<Guid> RequireGroupIdAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var groupId = await _events.FindGroupIdByEventIdAsync(eventId, cancellationToken);
        if (groupId is null)
        {
            throw new NotFoundException("Event not found.");
        }

        return groupId.Value;
    }
}
