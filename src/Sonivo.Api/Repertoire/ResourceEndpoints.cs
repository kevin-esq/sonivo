using System.Security.Claims;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Api.Realtime;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Repertoire;

internal static class ResourceEndpoints
{    internal static void MapResourceEndpoints(this WebApplication endpoints)
    {
        endpoints.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources", async (
            Guid groupId,
            Guid arrangementId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListResourcesHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var resources = await handler.HandleAsync(userId.Value, groupId, arrangementId, cancellationToken);
            return Results.Ok(resources.Select(ApiEndpointHelpers.ToResourceSummaryResponse));
        })
        .WithName("ListResources")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/resources", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListGroupResourcesHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var items = await handler.HandleAsync(new ListGroupResourcesQuery(userId.Value, groupId), cancellationToken);
            return Results.Ok(items.Select(ApiEndpointHelpers.ToGroupResourceResponse));
        })
        .WithName("ListGroupResources")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources", async (
            Guid groupId,
            Guid arrangementId,
            HttpRequest httpRequest,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            CreateLinkResourceHandler linkHandler,
            CreateFileResourceHandler fileHandler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (httpRequest.HasFormContentType)
            {
                var form = await httpRequest.ReadFormAsync(cancellationToken);
                var file = form.Files.GetFile("file");
                if (file is null || file.Length <= 0)
                {
                    return Results.Problem(
                        detail: "File is required and must not be empty.",
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Bad Request");
                }

                if (file.Length > ResourceFileConstraints.MaxByteSize)
                {
                    return Results.Problem(
                        detail: $"File must be {ResourceFileConstraints.MaxByteSize} bytes or fewer.",
                        statusCode: StatusCodes.Status413PayloadTooLarge,
                        title: "Content Too Large");
                }

                var contentType = ApiEndpointHelpers.ResolveUploadContentType(file.ContentType, file.FileName);
                await using var stream = file.OpenReadStream();
                var createdFile = await fileHandler.HandleAsync(
                    new CreateFileResourceCommand(
                        userId.Value,
                        groupId,
                        arrangementId,
                        form["purpose"].ToString(),
                        form["label"].ToString(),
                        ApiEndpointHelpers.NullIfWhiteSpace(form["part"].ToString()),
                        ApiEndpointHelpers.NullIfWhiteSpace(form["note"].ToString()),
                        file.FileName,
                        contentType,
                        file.Length,
                        stream),
                    cancellationToken);

                return Results.Created(
                    $"/api/groups/{groupId}/arrangements/{arrangementId}/resources/{createdFile.Id}",
                    ApiEndpointHelpers.ToResourceDetailResponse(createdFile));
            }

            var request = await httpRequest.ReadFromJsonAsync<CreateLinkResourceRequest>(cancellationToken: cancellationToken);
            if (request is null)
            {
                return Results.Problem(
                    detail: "Request body is required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request");
            }

            var created = await linkHandler.HandleAsync(
                new CreateLinkResourceCommand(
                    userId.Value,
                    groupId,
                    arrangementId,
                    request.Kind,
                    request.Purpose ?? string.Empty,
                    request.Label ?? string.Empty,
                    request.Part,
                    request.Note,
                    request.Url ?? string.Empty),
                cancellationToken);

            return Results.Created(
                $"/api/groups/{groupId}/arrangements/{arrangementId}/resources/{created.Id}",
                ApiEndpointHelpers.ToResourceDetailResponse(created));
        })
        .WithName("CreateResource")
        .RequireAuthorization()
        .RequireRateLimiting("group-upload")
        // Bound multipart buffering to the largest accepted audio file plus form overhead.
        .WithMetadata(new RequestSizeLimitAttribute(251L * 1024 * 1024))
        .WithMetadata(new RequestFormLimitsAttribute
        {
            MultipartBodyLengthLimit = 251L * 1024 * 1024
        });

        endpoints.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}", async (
            Guid groupId,
            Guid arrangementId,
            Guid resourceId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetResourceHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var resource = await handler.HandleAsync(userId.Value, groupId, arrangementId, resourceId, cancellationToken);
            return Results.Ok(ApiEndpointHelpers.ToResourceDetailResponse(resource));
        })
        .WithName("GetResource")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}/content", async (
            Guid groupId,
            Guid arrangementId,
            Guid resourceId,
            HttpRequest httpRequest,
            HttpContext httpContext,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetResourceContentHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            long? rangeStart = null;
            long? rangeEnd = null;
            if (string.IsNullOrWhiteSpace(httpRequest.Headers.IfRange)
                && RangeHeaderValue.TryParse(httpRequest.Headers.Range.ToString(), out var requestedRange)
                && string.Equals(requestedRange.Unit, "bytes", StringComparison.OrdinalIgnoreCase)
                && requestedRange.Ranges.Count == 1)
            {
                var singleRange = requestedRange.Ranges.Single();
                rangeStart = singleRange.From;
                rangeEnd = singleRange.To;
            }

            var content = await handler.HandleAsync(
                userId.Value,
                groupId,
                arrangementId,
                resourceId,
                cancellationToken,
                rangeStart,
                rangeEnd);

            return ApiEndpointHelpers.CreateResourceContentResult(content, httpContext);
        })
        .WithName("GetResourceContent")
        .RequireAuthorization();

        endpoints.MapPatch("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}", async (
            Guid groupId,
            Guid arrangementId,
            Guid resourceId,
            UpdateLinkResourceRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            UpdateLinkResourceHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var updated = await handler.HandleAsync(
                new UpdateLinkResourceCommand(
                    userId.Value,
                    groupId,
                    arrangementId,
                    resourceId,
                    request.Purpose,
                    request.Label,
                    request.Part,
                    request.Note),
                cancellationToken);

            return Results.Ok(ApiEndpointHelpers.ToResourceDetailResponse(updated));
        })
        .WithName("UpdateLinkResource")
        .RequireAuthorization();

        endpoints.MapDelete("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}", async (
            Guid groupId,
            Guid arrangementId,
            Guid resourceId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            DeleteResourceHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await handler.HandleAsync(userId.Value, groupId, arrangementId, resourceId, cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeleteResource")
        .RequireAuthorization();

        // ADR-0032 Q-W32-4: async digitizer job. POST validates eligibility and
        // returns 202; transcription runs in the background and never writes
        // Arrangement fields — the Owner saves drafts via the existing PATCH.
        endpoints.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/digitize", async (
            Guid groupId,
            Guid arrangementId,
            DigitizeRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            StartDigitizeJobHandler handler,
            DigitizeJobQueue queue,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var started = await handler.HandleAsync(
                new StartDigitizeJobCommand(userId.Value, groupId, arrangementId, request.ResourceId),
                cancellationToken);

            var jobId = started.JobId;
            if (!await queue.TryEnqueueAsync(jobId, cancellationToken))
            {
                // SECURITY-AUDIT-2026-10 (B7): the job was marked failed server-side;
                // tell the owner to retry later instead of silently dropping it.
                return Results.Problem(
                    detail: "La cola de digitalización está llena. Inténtalo en unos minutos.",
                    statusCode: StatusCodes.Status503ServiceUnavailable,
                    title: "Service Unavailable");
            }

            return Results.Accepted(
                $"/api/groups/{groupId}/arrangements/{arrangementId}/digitize/{jobId}",
                new { jobId, status = started.Status });
        })
        .WithName("StartDigitize")
        .RequireAuthorization()
        .RequireRateLimiting("digitize");

        endpoints.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/digitize/{jobId:guid}", async (
            Guid groupId,
            Guid arrangementId,
            Guid jobId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetDigitizeJobHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var job = await handler.HandleAsync(userId.Value, groupId, arrangementId, jobId, cancellationToken);
            return Results.Ok(new
            {
                jobId = job.JobId,
                status = job.Status,
                segments = job.Segments?.Select(s => new
                {
                    startMs = s.StartMs,
                    endMs = s.EndMs,
                    text = s.Text
                }),
                errorCode = job.ErrorCode
            });
        })
        .WithName("GetDigitizeJob")
        .RequireAuthorization();
    }

    internal static void MapResourceGrantEndpoints(this WebApplication endpoints)
    {
        // ---- ADR-0085: hierarchical repertoire access overrides ----

        endpoints.MapGet("/api/groups/{groupId:guid}/members/{targetUserId:guid}/resource-grants", async (
            Guid groupId,
            Guid targetUserId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GroupAccessService access,
            IResourceGrantStore grants,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await access.RequirePermissionAsync(groupId, userId.Value, GroupPermissions.ManageMembers, cancellationToken);
            var (_, targetMembership) = await access.RequireMemberAsync(groupId, targetUserId, cancellationToken);
            if (targetMembership.IsOwner)
            {
                return Results.Problem(
                    detail: "Item access overrides cannot be assigned to the group owner.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request");
            }

            var list = await grants.ListForUserAsync(groupId, targetUserId, cancellationToken);
            return Results.Ok(new
            {
                items = list.Select(g => new
                {
                    id = g.Id,
                    resourceType = g.ResourceType,
                    resourceId = g.ResourceId,
                    granted = g.Granted,
                    createdAt = g.CreatedAt
                })
            });
        })
        .WithName("ListMemberResourceGrants")
        .RequireAuthorization();

        endpoints.MapPut("/api/groups/{groupId:guid}/members/{targetUserId:guid}/resource-grants", async (
            Guid groupId,
            Guid targetUserId,
            SetResourceGrantRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GroupAccessService access,
            IResourceGrantStore grants,
            IGroupAuditStore audit,
            ISongStore songs,
            IArrangementStore arrangements,
            IResourceStore resources,
            IClock clock,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await access.RequirePermissionAsync(
                groupId, userId.Value, GroupPermissions.ManageMembers, cancellationToken);
            var (_, targetMembership) = await access.RequireMemberAsync(groupId, targetUserId, cancellationToken);
            if (targetMembership.IsOwner)
            {
                return Results.Problem(
                    detail: "Item access overrides cannot be assigned to the group owner.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request");
            }

            var resourceType = request.ResourceType?.Trim().ToLowerInvariant() ?? string.Empty;
            if (!Sonivo.Domain.Tenancy.ResourceGrant.ResourceTypes.IsKnown(resourceType))
            {
                return Results.Problem(
                    detail: "Unknown resource type.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request");
            }

            if (request.ResourceId == Guid.Empty)
            {
                return Results.Problem(
                    detail: "ResourceId is required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request");
            }

            // Polymorphic grants have no target FK. Resolve every target and its parent
            // chain through stores scoped to this Group before persisting an override.
            var targetExists = false;
            if (request.Granted is not null)
            {
                if (resourceType == Sonivo.Domain.Tenancy.ResourceGrant.ResourceTypes.Song)
                {
                    targetExists = await songs.GetByIdAsync(groupId, request.ResourceId, cancellationToken) is not null;
                }
                else if (resourceType == Sonivo.Domain.Tenancy.ResourceGrant.ResourceTypes.Arrangement)
                {
                    var arrangement = await arrangements.GetByIdAsync(groupId, request.ResourceId, cancellationToken);
                    if (arrangement is not null)
                    {
                        targetExists = await songs.GetByIdAsync(groupId, arrangement.SongId, cancellationToken) is not null;
                    }
                }
                else if (resourceType == Sonivo.Domain.Tenancy.ResourceGrant.ResourceTypes.Resource)
                {
                    var target = (await resources.ListByGroupAsync(groupId, cancellationToken))
                        .FirstOrDefault(resource => resource.Id == request.ResourceId);
                    if (target is not null)
                    {
                        var arrangement = await arrangements.GetByIdAsync(groupId, target.ArrangementId, cancellationToken);
                        targetExists = arrangement is not null
                            && await songs.GetByIdAsync(groupId, arrangement.SongId, cancellationToken) is not null;
                    }
                }

                if (!targetExists)
                {
                    return Results.NotFound();
                }
            }

            // Defence in depth: an allow may only ever target a read capability, so the
            // request cannot smuggle a write capability through the resource layer.
            if (request.Granted is bool allow && !GroupPermissions.IsReadCapability(ReadCapabilityOf(resourceType)))
            {
                return Results.Problem(
                    detail: "Only read access may be granted per resource.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request");
            }

            var existing = await grants.FindAsync(groupId, targetUserId, resourceType, request.ResourceId, cancellationToken);
            if (request.Granted == existing?.Granted)
            {
                return Results.NoContent();
            }

            if (existing is not null)
            {
                grants.Remove(existing);
            }

            if (request.Granted is bool granted)
            {
                await grants.AddAsync(ResourceGrant.Create(
                    groupId,
                    targetUserId,
                    resourceType,
                    request.ResourceId,
                    granted,
                    clock.UtcNow,
                    userId.Value), cancellationToken);
            }

            await audit.AddAsync(
                GroupAuditEntry.Create(
                    groupId,
                    GroupAuditEntry.ActionResourceGrantChanged,
                    clock.UtcNow,
                    actorUserId: userId.Value,
                    targetUserId,
                    metadata: $"resourceType={resourceType};resourceId={request.ResourceId:D};access={(request.Granted is null ? "inherit" : request.Granted.Value ? "allow" : "deny")}"),
                cancellationToken);
            await grants.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        })
        .WithName("SetMemberResourceGrant")
        .RequireAuthorization();

        static string ReadCapabilityOf(string resourceType) => resourceType switch
        {
            Sonivo.Domain.Tenancy.ResourceGrant.ResourceTypes.Song => Sonivo.Domain.Tenancy.GroupPermissions.SongView,
            Sonivo.Domain.Tenancy.ResourceGrant.ResourceTypes.Arrangement => Sonivo.Domain.Tenancy.GroupPermissions.ArrangementView,
            Sonivo.Domain.Tenancy.ResourceGrant.ResourceTypes.Resource => Sonivo.Domain.Tenancy.GroupPermissions.ResourceView,
            _ => string.Empty,
        };
    }
}
