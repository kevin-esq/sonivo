using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using Sonivo.Application.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Realtime;

internal static class PresenceEndpoints
{
    public static void MapPresenceEndpoints(this WebApplication endpoints)
    {
        // ADR-0055 W-E: best-effort presence heartbeat (throttled server-side, never authorizes).
        endpoints.MapPost("/api/presence/heartbeat", async (
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            PresenceHeartbeatHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await handler.HandleAsync(new PresenceHeartbeatCommand(userId.Value, DateTimeOffset.UtcNow), cancellationToken);
            return Results.NoContent();
        })
        .WithName("PresenceHeartbeat")
        .RequireAuthorization();
    }
}
