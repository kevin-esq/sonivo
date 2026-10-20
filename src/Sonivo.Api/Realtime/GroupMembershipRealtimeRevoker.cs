using Microsoft.AspNetCore.SignalR;
using Sonivo.Application.Realtime;

namespace Sonivo.Api.Realtime;

/// <summary>
/// Evicts active realtime connections after Group membership has committed as
/// revoked. Practice room presence is removed before the updated list is sent.
/// </summary>
public sealed class GroupMembershipRealtimeRevoker
{
    private readonly GroupRealtimeConnectionRegistry _connections;
    private readonly PracticeRoomState _rooms;
    private readonly IHubContext<PracticeRoomHub> _practiceHub;
    private readonly ILogger<GroupMembershipRealtimeRevoker> _logger;

    public GroupMembershipRealtimeRevoker(
        GroupRealtimeConnectionRegistry connections,
        PracticeRoomState rooms,
        IHubContext<PracticeRoomHub> practiceHub,
        ILogger<GroupMembershipRealtimeRevoker> logger)
    {
        _connections = connections;
        _rooms = rooms;
        _practiceHub = practiceHub;
        _logger = logger;
    }

    public async Task RevokeAsync(Guid groupId, Guid userId)
    {
        _connections.MarkMemberRevoked(groupId, userId);
        _connections.RemoveMember(groupId, userId);

        var affected = _rooms.RemoveGroupMember(groupId, userId);
        foreach (var (room, connectionId) in affected)
        {
            _logger.LogDebug(
                "Removed revoked PracticeRoom connection {ConnectionId} from {Room}",
                connectionId,
                room);
        }

        foreach (var room in affected.Select(item => item.Room).Distinct(StringComparer.Ordinal))
        {
            try
            {
                var presence = _rooms.GetPresence(room);
                foreach (var participant in presence)
                {
                    await _practiceHub.Clients
                        .Client(participant.ConnectionId)
                        .SendAsync("PresenceUpdate", presence);
                }
            }
            catch (Exception exception)
            {
                // A presence refresh is best-effort once sensitive membership
                // has been removed from the server-side room state.
                _logger.LogDebug(exception, "PracticeRoom presence refresh failed for {Room}", room);
            }
        }
    }
}
