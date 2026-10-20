using Microsoft.AspNetCore.SignalR;
using Sonivo.Application.Realtime;
using Sonivo.Api.Realtime;

namespace Sonivo.Api.Realtime;

/// <summary>
/// SignalR-backed <see cref="IGroupNotifier"/>. Sends a lightweight
/// <c>GroupChanged</c> message (group + scope) to connections that completed
/// server-side Group authorization; clients re-fetch the affected slice.
/// Best-effort: a failure to broadcast never fails the write that triggered it.
/// </summary>
public sealed class SignalRGroupNotifier : IGroupNotifier
{
    private readonly IHubContext<GroupHub> _hub;
    private readonly GroupRealtimeConnectionRegistry _connections;
    private readonly ILogger<SignalRGroupNotifier> _logger;

    public SignalRGroupNotifier(
        IHubContext<GroupHub> hub,
        GroupRealtimeConnectionRegistry connections,
        ILogger<SignalRGroupNotifier> logger)
    {
        _hub = hub;
        _connections = connections;
        _logger = logger;
    }

    public async Task NotifyGroupChangedAsync(
        Guid groupId,
        string scope,
        CancellationToken cancellationToken = default)
    {
        foreach (var connectionId in _connections.GetActiveGroupConnections(groupId))
        {
            try
            {
                await _hub.Clients
                    .Client(connectionId)
                    .SendAsync("GroupChanged", new { groupId, scope }, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(
                    ex,
                    "Group change broadcast failed for {GroupId} ({Scope}) on {ConnectionId}",
                    groupId,
                    scope,
                    connectionId);
            }
        }
    }
}
