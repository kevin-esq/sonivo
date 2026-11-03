using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Sonivo.Application.Repertoire;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Repertoire;

public static class ChordProEndpoints
{
    public static void MapChordProEndpoints(this WebApplication app)
    {
        app.MapPost("/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/chordpro/convert", async (
            Guid groupId,
            Guid arrangementId,
            ChordProConversionRequest request,
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> users,
            ConvertChordSheetHandler handler,
            CancellationToken cancellationToken) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            var chords = await handler.HandleAsync(user.Id, groupId, arrangementId, request.Text, cancellationToken);
            return Results.Ok(new ChordProConversionResponse(chords));
        })
        .WithName("ConvertChordSheetToChordPro")
        .WithTags("Repertoire")
        .WithMetadata(new RequestSizeLimitAttribute(ConvertChordSheetHandler.MaxInputBytes + 4096))
        .RequireAuthorization();
    }
}

public sealed record ChordProConversionRequest(string Text);
public sealed record ChordProConversionResponse(string Chords);
