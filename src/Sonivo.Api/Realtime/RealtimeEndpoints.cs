using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.SignalR;

namespace Sonivo.Api.Realtime;

internal static class RealtimeEndpoints
{
    public static void MapRealtimeEndpoints(this WebApplication app)
    {
        // ADR-0036: Q9 conductor room. Cookie-authorized; per-method Membership
        // recheck inside the Hub (404 non-member/unknown, 403 non-Owner conduct).
        app.MapHub<PracticeRoomHub>("/hubs/practiceroom").RequireAuthorization();
        app.MapHub<GroupHub>("/hubs/group").RequireAuthorization();
        app.MapHub<NotificationHub>("/hubs/notifications").RequireAuthorization();
    }
}
