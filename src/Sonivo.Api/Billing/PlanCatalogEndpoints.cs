using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Sonivo.Application.Billing;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Billing;

internal static class PlanCatalogEndpoints
{
    public static void MapPlanCatalogAndUsageEndpoints(this WebApplication endpoints)
    {
        endpoints.MapGet("/api/plans", (GetPlanCatalogHandler handler) =>
                Results.Ok(ApiEndpointHelpers.ToPlanCatalogResponse(handler.Handle())))
            .WithName("GetPlanCatalog")
            .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/usage", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetGroupUsageHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(ApiEndpointHelpers.ToUsageResponse(await handler.HandleAsync(userId.Value, groupId, cancellationToken)));
        })
        .WithName("GetGroupUsage")
        .RequireAuthorization();
    }
}
