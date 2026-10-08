using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Sonivo.Api.Realtime;

/// <summary>
/// Per-user notification hub (ADR-0077). Each connection joins a private
/// <c>user:{id}</c> group and the server pushes <c>NotificationCreated</c> there
/// whenever an inbox row is created. There is no client-invoked method, so the
/// hub exposes no server-side mutation surface.
/// </summary>
[Authorize]
public sealed class NotificationHub : Hub
{
    public static string UserGroup(Guid userId) => $"user:{userId:D}";

    public override async Task OnConnectedAsync()
    {
        var id = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(id, out var userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));
        }

        await base.OnConnectedAsync();
    }
}
