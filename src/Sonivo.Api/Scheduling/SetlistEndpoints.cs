using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Sonivo.Application.Scheduling;
using Sonivo.Infrastructure.Identity;

internal static class SetlistEndpoints
{
    internal static void MapSetlistEndpoints(this WebApplication endpoints)
    {
        endpoints.MapGet("/api/groups/{groupId:guid}/setlists", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListSetlistsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var setlists = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
            return Results.Ok(setlists.Select(ApiEndpointHelpers.ToSetlistListResponse));
        })
        .WithName("ListSetlists")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/setlists", async (
            Guid groupId,
            CreateSetlistRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            CreateSetlistHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var created = await handler.HandleAsync(
                new CreateSetlistCommand(userId.Value, groupId, request.Name ?? string.Empty),
                cancellationToken);

            return Results.Created($"/api/groups/{groupId}/setlists/{created.Id}", ApiEndpointHelpers.ToSetlistDetailResponse(created));
        })
        .WithName("CreateSetlist")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/setlists/{setlistId:guid}", async (
            Guid groupId,
            Guid setlistId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetSetlistHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var setlist = await handler.HandleAsync(userId.Value, groupId, setlistId, cancellationToken);
            return Results.Ok(ApiEndpointHelpers.ToSetlistDetailResponse(setlist));
        })
        .WithName("GetSetlist")
        .RequireAuthorization();

        endpoints.MapPatch("/api/groups/{groupId:guid}/setlists/{setlistId:guid}", async (
            Guid groupId,
            Guid setlistId,
            UpdateSetlistRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            UpdateSetlistHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var updated = await handler.HandleAsync(
                new UpdateSetlistCommand(
                    userId.Value,
                    groupId,
                    setlistId,
                    request.Name ?? string.Empty,
                    request.ExpectedVersion),
                cancellationToken);

            return Results.Ok(ApiEndpointHelpers.ToSetlistDetailResponse(updated));
        })
        .WithName("UpdateSetlist")
        .RequireAuthorization();

        endpoints.MapPut("/api/groups/{groupId:guid}/setlists/{setlistId:guid}/items", async (
            Guid groupId,
            Guid setlistId,
            ReplaceSetlistItemsRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ReplaceSetlistItemsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var items = (request.Items ?? [])
                .Select(i => new SetlistItemReplaceDto(i.ArrangementId, i.SortOrder))
                .ToList();

            var updated = await handler.HandleAsync(
                new ReplaceSetlistItemsCommand(
                    userId.Value,
                    groupId,
                    setlistId,
                    request.ExpectedVersion,
                    items),
                cancellationToken);

            return Results.Ok(ApiEndpointHelpers.ToSetlistDetailResponse(updated));
        })
        .WithName("ReplaceSetlistItems")
        .RequireAuthorization();
    }
}
