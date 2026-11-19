using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Sonivo.Application.Tenancy;
using Sonivo.Infrastructure.Identity;

internal static class SchedulingEndpoints
{
    internal static void MapSchedulingEndpoints(this WebApplication endpoints)
    {
        // ADR-0053: upcoming events across the caller's groups (Inicio dashboard).
        endpoints.MapGet("/api/activity/upcoming", async (
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListUpcomingActivityHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var items = await handler.HandleAsync(userId.Value, cancellationToken);
            return Results.Ok(items.Select(ApiEndpointHelpers.ToUpcomingActivityResponse));
        })
        .WithName("ListUpcomingActivity")
        .RequireAuthorization();

        // ADR-0053 addendum: general calendar across the caller's groups (read-only).
        endpoints.MapGet("/api/activity/calendar", async (
            string? from,
            string? to,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListCalendarEventsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (!DateTimeOffset.TryParse(
                    from,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out var fromValue)
                || !DateTimeOffset.TryParse(
                    to,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out var toValue))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["range"] = new[] { "A valid ISO-8601 'from' and 'to' are required." }
                });
            }

            if (fromValue >= toValue)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["range"] = new[] { "'from' must be earlier than 'to'." }
                });
            }

            if (toValue - fromValue > TimeSpan.FromDays(62))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["range"] = new[] { "The requested range must not exceed 62 days." }
                });
            }

            var items = await handler.HandleAsync(userId.Value, fromValue, toValue, cancellationToken);
            return Results.Ok(items.Select(ApiEndpointHelpers.ToUpcomingActivityResponse));
        })
        .WithName("ListCalendarEvents")
        .RequireAuthorization();
    }
}
