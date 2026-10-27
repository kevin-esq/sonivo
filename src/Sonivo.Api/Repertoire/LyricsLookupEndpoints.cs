using System.Globalization;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Repertoire;

/// <summary>Explicit, review-only lookup against a fixed public lyrics provider.</summary>
public static class LyricsLookupEndpoints
{
    public static void MapLyricsLookup(this WebApplication app)
    {
        app.MapGet("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/lyrics/export.{format}", async (
            Guid groupId, Guid arrangementId, string format, ClaimsPrincipal principal, UserManager<ApplicationUser> users,
            GetArrangementHandler arrangements, CancellationToken cancellationToken) =>
        {
            if (!app.Configuration.GetValue("Features:Lrc", false) || format is not ("ttml" or "cho")) return Results.NotFound();
            var user = await users.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            var arrangement = await arrangements.HandleAsync(user.Id, groupId, arrangementId, cancellationToken);
            var source = string.IsNullOrWhiteSpace(arrangement.Chords) ? arrangement.Lyrics : arrangement.Chords;
            return format == "ttml"
                ? Results.Text(SonivoLyricsDocument.Export(source, arrangement.ChordTimingJson), "application/ttml+xml; charset=utf-8")
                : Results.Text(source ?? string.Empty, "text/plain; charset=utf-8");
        }).WithName("ExportArrangementLyricsDocument").WithTags("Lyrics").RequireAuthorization();

        app.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/lyrics/lookup", async (
            Guid groupId, Guid arrangementId, LyricsLookupRequest request, ClaimsPrincipal principal,
            UserManager<ApplicationUser> users, GetArrangementHandler arrangements, IGroupStore groups,
            IHttpClientFactory clients, CancellationToken cancellationToken) =>
        {
            if (!app.Configuration.GetValue("Features:Lrc", false)) return Results.NotFound();
            var user = await users.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            await arrangements.HandleAsync(user.Id, groupId, arrangementId, cancellationToken);
            var membership = await groups.GetMembershipAsync(groupId, user.Id, cancellationToken);
            if (membership is null || !membership.IsOwner) return Results.StatusCode(403);
            if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Length > 200 ||
                string.IsNullOrWhiteSpace(request.Artist) || request.Artist.Length > 200 ||
                request.Album?.Length > 200 || request.Duration is < 1 or > 3600)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lyricsLookup"] = ["lyrics.invalidLookup"] });

            var query = $"https://lrclib.net/api/get?track_name={Uri.EscapeDataString(request.Title.Trim())}&artist_name={Uri.EscapeDataString(request.Artist.Trim())}";
            if (!string.IsNullOrWhiteSpace(request.Album)) query += $"&album_name={Uri.EscapeDataString(request.Album.Trim())}";
            if (request.Duration.HasValue) query += $"&duration={request.Duration.Value.ToString(CultureInfo.InvariantCulture)}";
            try
            {
                using var client = clients.CreateClient("lyrics-lrclib");
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                deadline.CancelAfter(TimeSpan.FromSeconds(8));
                using var response = await client.GetAsync(query, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
                if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound();
                if (!response.IsSuccessStatusCode) return Results.Problem(statusCode: 502, title: "Lyrics provider unavailable.");
                if (response.Content.Headers.ContentLength > 512 * 1024) return Results.Problem(statusCode: 502, title: "Invalid lyrics provider response.");
                await using var stream = await response.Content.ReadAsStreamAsync(deadline.Token);
                using var bytes = new MemoryStream();
                var buffer = new byte[8192];
                int read;
                while ((read = await stream.ReadAsync(buffer, deadline.Token)) > 0)
                {
                    if (bytes.Length + read > 512 * 1024) return Results.Problem(statusCode: 502, title: "Invalid lyrics provider response.");
                    bytes.Write(buffer, 0, read);
                }
                using var json = JsonDocument.Parse(bytes.ToArray(), new JsonDocumentOptions { MaxDepth = 32 });
                var record = json.RootElement;
                var title = ReadString(record, "trackName");
                var artist = ReadString(record, "artistName");
                var album = ReadString(record, "albumName");
                var content = ReadString(record, "syncedLyrics");
                if (!record.TryGetProperty("duration", out var durationValue) || !durationValue.TryGetDouble(out var duration) || !double.IsFinite(duration) ||
                    !record.TryGetProperty("id", out var id) || !id.TryGetInt64(out var recordId))
                    return Results.Problem(statusCode: 502, title: "Invalid lyrics provider response.");
                if (!string.Equals(title?.Trim(), request.Title.Trim(), StringComparison.OrdinalIgnoreCase) ||
                    !string.Equals(artist?.Trim(), request.Artist.Trim(), StringComparison.OrdinalIgnoreCase) ||
                    (!string.IsNullOrWhiteSpace(request.Album) && !string.Equals(album?.Trim(), request.Album.Trim(), StringComparison.OrdinalIgnoreCase)) ||
                    (request.Duration.HasValue && Math.Abs(duration - request.Duration.Value) > 2))
                    return Results.NotFound();
                if (string.IsNullOrWhiteSpace(content) || Encoding.UTF8.GetByteCount(content) > LrcParser.MaxBytes)
                    return Results.UnprocessableEntity(new { code = "lyrics.noSyncedMatch" });
                var parsed = LrcParser.Parse(Encoding.UTF8.GetBytes(content));
                if (parsed.Errors.Count > 0 || parsed.Entries.Count == 0)
                    return Results.Problem(statusCode: 502, title: "Invalid lyrics provider response.");
                return Results.Ok(new LyricsLookupResponse("LRCLIB", recordId, title!, artist!, album, duration, content));
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return Results.Problem(statusCode: 504, title: "Lyrics provider timed out.");
            }
            catch (Exception error) when (error is HttpRequestException or JsonException or InvalidOperationException)
            {
                return Results.Problem(statusCode: 502, title: "Lyrics provider unavailable.");
            }
        })
        .WithName("LookupArrangementLyrics")
        .WithTags("Lyrics")
        .WithSummary("Find a line-synced recording candidate for explicit Owner review.")
        .RequireAuthorization()
        .RequireRateLimiting("group-upload")
        .WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(4096));
    }

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}

/// <summary>Recording metadata supplied explicitly by the Owner; duration is in seconds.</summary>
public sealed record LyricsLookupRequest(string? Title, string? Artist, string? Album, int? Duration);

/// <summary>A verified line-synced candidate; importing and saving require separate explicit actions.</summary>
public sealed record LyricsLookupResponse(string Source, long RecordId, string Title, string Artist, string? Album, double Duration, string Content);
