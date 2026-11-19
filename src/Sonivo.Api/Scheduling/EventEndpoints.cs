using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Scheduling;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Scheduling;
using Sonivo.Infrastructure.Identity;

internal static class EventEndpoints
{
    internal static void MapEventEndpoints(this WebApplication endpoints)
    {
        endpoints.MapGet("/api/groups/{groupId:guid}/events", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListEventsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var events = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
            return Results.Ok(events.Select(ApiEndpointHelpers.ToEventListResponse));
        })
        .WithName("ListEvents")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/events", async (
            Guid groupId,
            CreateEventRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            CreateEventHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var created = await handler.HandleAsync(
                new CreateEventCommand(
                    userId.Value,
                    groupId,
                    request.Title ?? string.Empty,
                    request.Type ?? string.Empty,
                    request.StartsAt),
                cancellationToken);

            return Results.Created($"/api/groups/{groupId}/events/{created.Id}", ApiEndpointHelpers.ToEventDetailResponse(created));
        })
        .WithName("CreateEvent")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/events/{eventId:guid}", async (
            Guid groupId,
            Guid eventId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetEventHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var musicalEvent = await handler.HandleAsync(userId.Value, groupId, eventId, cancellationToken);
            return Results.Ok(ApiEndpointHelpers.ToEventDetailResponse(musicalEvent));
        })
        .WithName("GetEvent")
        .RequireAuthorization();

        endpoints.MapPatch("/api/groups/{groupId:guid}/events/{eventId:guid}", async (
            Guid groupId,
            Guid eventId,
            UpdateEventRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            UpdateEventHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var updated = await handler.HandleAsync(
                new UpdateEventCommand(
                    userId.Value,
                    groupId,
                    eventId,
                    request.Title,
                    request.Type,
                    request.StartsAt,
                    request.ExpectedVersion),
                cancellationToken);

            return Results.Ok(ApiEndpointHelpers.ToEventDetailResponse(updated));
        })
        .WithName("UpdateEvent")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/events/{eventId:guid}/cancel", async (
            Guid groupId,
            Guid eventId,
            CancelEventRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            CancelEventHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await handler.HandleAsync(
                new CancelEventCommand(userId.Value, groupId, eventId, request.ExpectedVersion),
                cancellationToken);

            return Results.NoContent();
        })
        .WithName("CancelEvent")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/events/{eventId:guid}/duplicate", async (
            Guid groupId,
            Guid eventId,
            [FromBody] DuplicateEventRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            [FromServices] DuplicateEventHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var musicalEvent = await handler.HandleAsync(
                new DuplicateEventCommand(userId.Value, groupId, eventId, request.ExpectedVersion),
                cancellationToken);

            return Results.Ok(ApiEndpointHelpers.ToEventDetailResponse(musicalEvent));
        })
        .WithName("DuplicateEvent")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/events/{eventId:guid}/apply-setlist", async (
            Guid groupId,
            Guid eventId,
            ApplySetlistRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ReplaceEventPlanFromSetlistHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var musicalEvent = await handler.HandleAsync(
                new ReplaceEventPlanFromSetlistCommand(
                    userId.Value,
                    groupId,
                    eventId,
                    request.SetlistId,
                    request.ExpectedVersion,
                    request.ConfirmReplace),
                cancellationToken);

            return Results.Ok(ApiEndpointHelpers.ToEventDetailResponse(musicalEvent));
        })
        .WithName("ApplySetlistToEvent")
        .RequireAuthorization();

        endpoints.MapPut("/api/groups/{groupId:guid}/events/{eventId:guid}/rsvp", async (
            Guid groupId,
            Guid eventId,
            UpsertEventRsvpRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            UpsertEventRsvpHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var rsvp = await handler.HandleAsync(
                new UpsertEventRsvpCommand(userId.Value, groupId, eventId, request.Response),
                cancellationToken);

            return Results.Ok(new
            {
                userId = rsvp.UserId,
                response = rsvp.Response,
                updatedAt = rsvp.UpdatedAt
            });
        })
        .WithName("UpsertEventRsvp")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/events/{eventId:guid}/rsvps", async (
            Guid groupId,
            Guid eventId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListEventRsvpsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var list = await handler.HandleAsync(userId.Value, groupId, eventId, cancellationToken);
            return Results.Ok(new
            {
                items = list.Items.Select(i => new
                {
                    userId = i.UserId,
                    displayName = i.DisplayName,
                    response = i.Response,
                    updatedAt = i.UpdatedAt
                })
            });
        })
        .WithName("ListEventRsvps")
        .RequireAuthorization();

        // ADR-0052: read-only per-group ICS feed. Behind Features:Notifications (default off).
        endpoints.MapGet("/api/groups/{groupId:guid}/calendar.ics", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GroupAccessService access,
            IGroupStore groups,
            IEventStore events,
            IClock clock,
            IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            if (!configuration.GetValue("Features:Notifications", false))
            {
                return Results.NotFound();
            }

            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await access.RequireMemberAsync(groupId, userId.Value, cancellationToken);
            var group = await groups.GetByIdAsync(groupId, cancellationToken);
            var upcoming = (await events.ListActiveByGroupAsync(groupId, cancellationToken))
                .Where(e => e.Status != EventStatuses.Cancelled && !e.IsHidden)
                .OrderBy(e => e.StartsAt)
                .ToList();

            var ics = IcsCalendar.Build(group?.Name ?? "Sonivo", upcoming, clock.UtcNow);
            return Results.Text(ics, "text/calendar; charset=utf-8");
        })
        .WithName("GroupCalendarIcs")
        .RequireAuthorization();
    }
}
