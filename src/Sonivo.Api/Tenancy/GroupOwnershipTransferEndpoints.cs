using System.Security.Claims;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;

namespace Sonivo.Api.Tenancy;

internal static class GroupOwnershipTransferEndpoints
{
    private sealed record RequestDto(Guid TargetUserId);

    public static void MapGroupOwnershipTransferEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/groups/{groupId:guid}/ownership-transfer")
            .RequireAuthorization().WithTags("Group ownership");

        routes.MapGet("", async (Guid groupId, ClaimsPrincipal principal,
            GroupOwnershipTransferHandlers handler, CancellationToken ct) =>
            await handler.GetPendingAsync(UserId(principal), groupId, ct) is { } pending
                ? Results.Ok(pending) : Results.NoContent());

        routes.MapPost("", async (Guid groupId, RequestDto? request, ClaimsPrincipal principal,
            GroupOwnershipTransferHandlers handler, CancellationToken ct) =>
        {
            if (request is null || request.TargetUserId == Guid.Empty)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["targetUserId"] = ["A target Group member is required."] });
            return Results.Accepted(value: await handler.RequestAsync(UserId(principal), groupId, request.TargetUserId, ct));
        });

        routes.MapPost("/{transferId:guid}/accept", async (Guid groupId, Guid transferId,
            ClaimsPrincipal principal, GroupOwnershipTransferHandlers handler, CancellationToken ct) =>
        {
            await handler.AcceptAsync(UserId(principal), groupId, transferId, ct);
            return Results.NoContent();
        });

        routes.MapDelete("/{transferId:guid}", async (Guid groupId, Guid transferId,
            ClaimsPrincipal principal, GroupOwnershipTransferHandlers handler, CancellationToken ct) =>
        {
            await handler.CancelAsync(UserId(principal), groupId, transferId, ct);
            return Results.NoContent();
        });
    }

    private static Guid UserId(ClaimsPrincipal principal)
        => Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) && id != Guid.Empty
            ? id : throw new ForbiddenException("Authenticated user is required.");
}
