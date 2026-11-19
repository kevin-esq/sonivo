using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Repertoire;

internal static class SongEndpoints
{    internal static void MapSongTagEndpoints(this WebApplication endpoints)
    {
        endpoints.MapGet("/api/groups/{groupId:guid}/song-tags", async (
            Guid groupId, ClaimsPrincipal principal, UserManager<ApplicationUser> users,
            GetGroupSongTagsHandler handler, CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null) return Results.Unauthorized();
            var result = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
            return Results.Ok(new { tags = result.Tags, version = result.Version });
        })
        .WithName("GetGroupSongTags")
        .RequireAuthorization();

        endpoints.MapPut("/api/groups/{groupId:guid}/song-tags", async (
            Guid groupId, UpdateGroupSongTagsRequest request, ClaimsPrincipal principal,
            UserManager<ApplicationUser> users, UpdateGroupSongTagsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null) return Results.Unauthorized();
            var result = await handler.HandleAsync(new UpdateGroupSongTagsCommand(
                userId.Value, groupId, request.ExpectedVersion, request.Tags ?? []), cancellationToken);
            return Results.Ok(new { tags = result.Tags, version = result.Version });
        })
        .WithName("UpdateGroupSongTags")
        .RequireAuthorization();
    }

    internal static void MapSongEndpoints(this WebApplication endpoints)
    {
        endpoints.MapGet("/api/groups/{groupId:guid}/songs", async (
            Guid groupId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListSongsHandler handler,
            SearchSongsHandler searchHandler,
            string? q,
            string? tag,
            bool? favoritesOnly,
            string? sort,
            string? sortDirection,
            int? page,
            int? pageSize,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            if (q is not null || tag is not null || favoritesOnly is not null || sort is not null || sortDirection is not null || page is not null || pageSize is not null)
            {
                var result = await searchHandler.HandleAsync(
                    userId.Value,
                    groupId,
                    q,
                    tag,
                    favoritesOnly ?? false,
                    sort,
                    sortDirection,
                    page ?? 1,
                    pageSize ?? 25,
                    cancellationToken);
                return Results.Ok(result);
            }

            var songs = await handler.HandleAsync(userId.Value, groupId, cancellationToken);
            return Results.Ok(songs.Select(ApiEndpointHelpers.ToSongListResponse));
        })
        .WithName("ListSongs")
        .RequireAuthorization();

        endpoints.MapPut("/api/groups/{groupId:guid}/songs/{songId:guid}/favorite", async (
            Guid groupId,
            Guid songId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            SetSongFavoriteHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null) return Results.Unauthorized();
            await handler.HandleAsync(userId.Value, groupId, songId, true, cancellationToken);
            return Results.NoContent();
        })
        .WithName("FavoriteSong")
        .RequireAuthorization();

        endpoints.MapDelete("/api/groups/{groupId:guid}/songs/{songId:guid}/favorite", async (
            Guid groupId,
            Guid songId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            SetSongFavoriteHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null) return Results.Unauthorized();
            await handler.HandleAsync(userId.Value, groupId, songId, false, cancellationToken);
            return Results.NoContent();
        })
        .WithName("UnfavoriteSong")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/songs", async (
            Guid groupId,
            CreateSongRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            CreateSongHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var created = await handler.HandleAsync(
                new CreateSongCommand(
                    userId.Value,
                    groupId,
                    request.Title ?? string.Empty,
                    request.Attribution,
                    request.OriginKind ?? string.Empty,
                    request.RightsNotes,
                    request.Tags is null ? null : string.Join(',', request.Tags),
                    request.Genre,
                    request.Album,
                    request.ReleaseYear),
                cancellationToken);

            return Results.Created($"/api/groups/{groupId}/songs/{created.Id}", ApiEndpointHelpers.ToSongDetailResponse(created));
        })
        .WithName("CreateSong")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/songs/{songId:guid}", async (
            Guid groupId,
            Guid songId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetSongHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var song = await handler.HandleAsync(userId.Value, groupId, songId, cancellationToken);
            return Results.Ok(ApiEndpointHelpers.ToSongDetailResponse(song));
        })
        .WithName("GetSong")
        .RequireAuthorization();

        endpoints.MapPatch("/api/groups/{groupId:guid}/songs/{songId:guid}", async (
            Guid groupId,
            Guid songId,
            UpdateSongRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            UpdateSongHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var updated = await handler.HandleAsync(
                new UpdateSongCommand(
                    userId.Value,
                    groupId,
                    songId,
                    request.Title,
                    request.Attribution,
                    request.OriginKind,
                    request.RightsNotes,
                    request.ExpectedVersion,
                    request.Tags is null ? null : string.Join(',', request.Tags),
                    request.Genre,
                    request.Album,
                    request.ReleaseYear,
                    request.ClearReleaseYear),
                cancellationToken);

            return Results.Ok(ApiEndpointHelpers.ToSongDetailResponse(updated));
        })
        .WithName("UpdateSong")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/songs/{songId:guid}/cover", async (
            Guid groupId, Guid songId, int expectedVersion, HttpRequest httpRequest,
            ClaimsPrincipal principal, UserManager<ApplicationUser> users,
            UploadSongCoverHandler handler, CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null) return Results.Unauthorized();
            if (!httpRequest.HasFormContentType)
                return Results.Problem(detail: "Multipart form is required.", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
            var file = (await httpRequest.ReadFormAsync(cancellationToken)).Files.GetFile("file");
            if (file is null || file.Length <= 0)
                return Results.Problem(detail: "Cover image file is required.", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
            if (!SongCoverImageConstraints.IsAllowed(file.ContentType))
                return Results.Problem(detail: "Cover image must be JPEG, PNG, or WebP.", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
            var (stream, error) = await ApiEndpointHelpers.ReadValidatedBrandingImageAsync(file, cancellationToken);
            if (error is not null) return error;
            if (!ApiEndpointHelpers.IsSongCoverImageSignature(stream!.ToArray(), file.ContentType))
            {
                await stream.DisposeAsync();
                return Results.Problem(detail: "Cover image content does not match its declared type.", statusCode: StatusCodes.Status400BadRequest, title: "Bad Request");
            }
            await using (stream!)
            {
                var result = await handler.HandleAsync(new UploadSongCoverCommand(
                    userId.Value, groupId, songId, expectedVersion, file.ContentType, file.Length, stream!), cancellationToken);
                return Results.Ok(ApiEndpointHelpers.ToSongDetailResponse(result));
            }
        })
        .WithName("UploadSongCoverImage")
        .RequireAuthorization()
        .RequireRateLimiting("group-upload")
        .WithMetadata(new RequestSizeLimitAttribute(3 * 1024 * 1024));

        endpoints.MapDelete("/api/groups/{groupId:guid}/songs/{songId:guid}/cover", async (
            Guid groupId, Guid songId, [FromBody] SoftDeleteSongRequest request, ClaimsPrincipal principal,
            UserManager<ApplicationUser> users, RemoveSongCoverHandler handler, CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null) return Results.Unauthorized();
            var result = await handler.HandleAsync(userId.Value, groupId, songId, request.ExpectedVersion, cancellationToken);
            return Results.Ok(ApiEndpointHelpers.ToSongDetailResponse(result));
        })
        .WithName("RemoveSongCoverImage")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/songs/{songId:guid}/cover", async (
            Guid groupId, Guid songId, ClaimsPrincipal principal, UserManager<ApplicationUser> users,
            GetSongCoverHandler handler, CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null) return Results.Unauthorized();
            var content = await handler.HandleAsync(userId.Value, groupId, songId, cancellationToken);
            return content is null ? Results.NotFound() : Results.File(content.Content, content.ContentType, enableRangeProcessing: true);
        })
        .WithName("GetSongCoverImage")
        .RequireAuthorization();

        endpoints.MapPut("/api/groups/{groupId:guid}/songs/{songId:guid}/default-arrangement", async (
            Guid groupId, Guid songId, SetDefaultArrangementRequest request, ClaimsPrincipal principal,
            UserManager<ApplicationUser> users, SetDefaultArrangementHandler handler, CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null) return Results.Unauthorized();
            var result = await handler.HandleAsync(new SetDefaultArrangementCommand(
                userId.Value, groupId, songId, request.ArrangementId, request.ExpectedVersion), cancellationToken);
            return Results.Ok(ApiEndpointHelpers.ToSongDetailResponse(result));
        })
        .WithName("SetDefaultArrangement")
        .RequireAuthorization();

        endpoints.MapDelete("/api/groups/{groupId:guid}/songs/{songId:guid}", async (
            Guid groupId,
            Guid songId,
            [FromBody] SoftDeleteSongRequest? request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            SoftDeleteSongHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await handler.HandleAsync(
                new SoftDeleteSongCommand(
                    userId.Value,
                    groupId,
                    songId,
                    request?.ExpectedVersion ?? 0),
                cancellationToken);

            return Results.NoContent();
        })
        .WithName("SoftDeleteSong")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/songs/{songId:guid}/arrangements", async (
            Guid groupId,
            Guid songId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ListArrangementsHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var arrangements = await handler.HandleAsync(userId.Value, groupId, songId, cancellationToken);
            return Results.Ok(arrangements.Select(ApiEndpointHelpers.ToArrangementListResponse));
        })
        .WithName("ListArrangements")
        .RequireAuthorization();

        endpoints.MapPost("/api/groups/{groupId:guid}/songs/{songId:guid}/arrangements", async (
            Guid groupId,
            Guid songId,
            CreateArrangementRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            CreateArrangementHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var created = await handler.HandleAsync(
                new CreateArrangementCommand(
                    userId.Value,
                    groupId,
                    songId,
                    request.Label ?? string.Empty,
                    request.DefaultKey,
                    request.DefaultBpm,
                    request.Lyrics,
                    request.Chords,
                    request.Structure,
                    request.Notes,
                    request.HarmonyJson),
                cancellationToken);

            return Results.Created(
                $"/api/groups/{groupId}/arrangements/{created.Id}",
                ApiEndpointHelpers.ToArrangementDetailResponse(created));
        })
        .WithName("CreateArrangement")
        .RequireAuthorization();

        endpoints.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}", async (
            Guid groupId,
            Guid arrangementId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetArrangementHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var arrangement = await handler.HandleAsync(userId.Value, groupId, arrangementId, cancellationToken);
            return Results.Ok(ApiEndpointHelpers.ToArrangementDetailResponse(arrangement));
        })
        .WithName("GetArrangement")
        .RequireAuthorization();

        endpoints.MapPatch("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}", async (
            Guid groupId,
            Guid arrangementId,
            UpdateArrangementRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            UpdateArrangementHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            var updated = await handler.HandleAsync(
                new UpdateArrangementCommand(
                    userId.Value,
                    groupId,
                    arrangementId,
                    request.Label,
                    request.DefaultKey,
                    request.DefaultBpm,
                    request.Lyrics,
                    request.Chords,
                    request.Structure,
                    request.Notes,
                    request.ChordTimingJson,
                    request.ExpectedVersion,
                    request.HarmonyJson),
                cancellationToken);

            return Results.Ok(ApiEndpointHelpers.ToArrangementDetailResponse(updated));
        })
        .WithName("UpdateArrangement")
        .RequireAuthorization();

        // ---------- .lrc import / export (ADR-0050). Flag: Features:Lrc (default off). ----------
    }

    internal static void MapArrangementLyricsEndpoints(this WebApplication endpoints)
    {
        endpoints.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/lyrics/import-lrc", async (
            Guid groupId,
            Guid arrangementId,
            ImportLrcRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetArrangementHandler arrangementHandler,
            IGroupStore groupStore,
            CancellationToken cancellationToken,
            IConfiguration configuration) =>
        {
            if (!configuration.GetValue("Features:Lrc", false))
            {
                return Results.NotFound();
            }

            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            // Membership first: a non-member must see 404, never 403 (no existence leak).
            await arrangementHandler.HandleAsync(userId.Value, groupId, arrangementId, cancellationToken);

            var membership = await groupStore.GetMembershipAsync(groupId, userId.Value, cancellationToken);
            if (membership is null || !membership.IsOwner)
            {
                return Results.StatusCode(StatusCodes.Status403Forbidden);
            }

            byte[] bytes;
            if (!string.IsNullOrEmpty(request.ContentBase64))
            {
                try
                {
                    bytes = Convert.FromBase64String(request.ContentBase64);
                }
                catch (FormatException)
                {
                    return Results.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["contentBase64"] = ["must be valid base64"]
                    });
                }
            }
            else if (request.Content is not null)
            {
                bytes = System.Text.Encoding.UTF8.GetBytes(request.Content);
            }
            else
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["content"] = ["content or contentBase64 is required"]
                });
            }

            var parsed = LrcParser.Parse(bytes);

            // Limit violations (line 0) are a hard 400 with the errors[{ line, reason }] contract.
            if (parsed.Errors.Any(e => e.Line == 0) || (parsed.Format != "lrc" && parsed.Errors.Count > 0))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["errors"] = parsed.Errors.Select(e => e.Reason).ToArray()
                });
            }

            // Preview only: convert, but never persist here.
            var conversion = LrcConverter.ToChordPro(parsed, request.OffsetMs ?? 0);

            return Results.Ok(new
            {
                encoding = parsed.Encoding,
                format = parsed.Format,
                wordCount = conversion.WordCount,
                lyrics = conversion.Lyrics,
                chordTimingJson = conversion.ChordTimingJson,
                markCount = conversion.MarkCount,
                metadata = parsed.Metadata,
                warnings = parsed.Warnings.Concat(conversion.Warnings).Distinct(),
                errors = parsed.Errors.Select(e => new { line = e.Line, reason = e.Reason })
            });
        })
        .WithName("ImportArrangementLyricsLrc")
        .RequireAuthorization()
        .RequireRateLimiting("group-upload")
        .WithMetadata(new RequestSizeLimitAttribute(1024 * 1024));

        endpoints.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/lyrics/export.lrc", async (
            Guid groupId,
            Guid arrangementId,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            GetArrangementHandler arrangementHandler,
            CancellationToken cancellationToken,
            IConfiguration configuration) =>
        {
            if (!configuration.GetValue("Features:Lrc", false))
            {
                return Results.NotFound();
            }

            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            // Read-only export: any member may export; a non-member gets 404 from the handler.
            var arrangement = await arrangementHandler.HandleAsync(userId.Value, groupId, arrangementId, cancellationToken);

            try
            {
                var lrc = LrcConverter.ToLrc(string.IsNullOrWhiteSpace(arrangement.Chords) ? arrangement.Lyrics : arrangement.Chords, arrangement.ChordTimingJson);
                return Results.Text(lrc, "text/plain; charset=utf-8");
            }
            catch (ValidationException ex)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["lyrics"] = [ex.Message]
                });
            }
        })
        .WithName("ExportArrangementLyricsLrc")
        .RequireAuthorization();

        // Anonymous feature flags: lets the SPA hide unfinished surfaces instead of guessing.
    }

    internal static void MapArrangementDeleteEndpoint(this WebApplication endpoints)
    {
        endpoints.MapDelete("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}", async (
            Guid groupId,
            Guid arrangementId,
            [FromBody] SoftDeleteArrangementRequest? request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            SoftDeleteArrangementHandler handler,
            CancellationToken cancellationToken) =>
        {
            var userId = await ApiEndpointHelpers.RequireUserIdAsync(principal, users);
            if (userId is null)
            {
                return Results.Unauthorized();
            }

            await handler.HandleAsync(
                new SoftDeleteArrangementCommand(
                    userId.Value,
                    groupId,
                    arrangementId,
                    request?.ExpectedVersion ?? 0),
                cancellationToken);

            return Results.NoContent();
        })
        .WithName("SoftDeleteArrangement")
        .RequireAuthorization();
    }
}
