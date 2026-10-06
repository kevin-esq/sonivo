using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Session;

/// <summary>
/// Host-based tenancy session handoff. The apex/app origin authenticates
/// normally, then <c>POST /api/session/handoff/start</c> mints a single-use code
/// for the requested target — the product host (<c>app.sonivo.lat</c>, no slug)
/// or a tenant host (<c>{slug}.sonivo.lat</c>). <c>POST /api/session/handoff/redeem</c>
/// exchanges it for a host-only Identity cookie on that host. Errors are
/// deliberately generic so a caller cannot distinguish unknown code, expired
/// code, unknown user, or non-member.
/// </summary>
public static class SessionHandoffEndpoints
{
    private const string InvalidCodeDetail = "Invalid or expired handoff code.";

    /// <summary>The reserved subdomain of the product host (ADR-0069 host map).</summary>
    private const string AppSubdomain = "app";

    public static IEndpointRouteBuilder MapSessionHandoffEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/session/handoff/start", StartAsync)
            .WithName("SessionHandoffStart")
            .RequireAuthorization()
            .RequireRateLimiting("session-handoff");

        app.MapPost("/api/session/handoff/redeem", RedeemAsync)
            .WithName("SessionHandoffRedeem")
            .AllowAnonymous()
            .RequireRateLimiting("session-handoff");

        return app;
    }

    private static async Task<IResult> StartAsync(
        SessionHandoffStartRequest request,
        ClaimsPrincipal principal,
        ITenantResolver tenants,
        GroupAccessService access,
        SessionHandoffService handoffs,
        IPublicOrigin origin,
        HttpContext http,
        CancellationToken cancellationToken)
    {
        var userId = ResolveUserId(principal);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        // No slug => app-scope handoff (the product host): any authenticated
        // user, no group to authorize. A slug => tenant handoff.
        var slug = string.IsNullOrWhiteSpace(request.Slug)
            ? null
            : request.Slug.Trim().ToLowerInvariant();

        Guid? groupId = null;
        if (slug is not null)
        {
            var group = await tenants.ResolveAsync(slug, cancellationToken);
            if (group is null)
            {
                return Results.NotFound();
            }

            // Non-membership throws (mapped to 404 by AppExceptionHandler):
            // starting a tenant handoff is equivalent to asking for access.
            await access.RequireMemberAsync(group.Id, userId.Value, cancellationToken);
            groupId = group.Id;
        }

        var created = handoffs.Create(
            userId.Value,
            groupId,
            slug,
            http.Request.Headers.UserAgent.ToString());

        var subdomain = slug ?? AppSubdomain;
        var redirect = BuildHandoffRedirect(origin, http, subdomain, created.Code);
        return Results.Ok(new { redirect });
    }

    private static async Task<IResult> RedeemAsync(
        SessionHandoffRedeemRequest request,
        UserManager<ApplicationUser> users,
        SignInManager<ApplicationUser> signInManager,
        GroupAccessService access,
        SessionHandoffService handoffs,
        HttpContext http,
        CancellationToken cancellationToken)
    {
        var ticket = handoffs.Consume(
            request.Code ?? string.Empty,
            http.Request.Headers.UserAgent.ToString());
        if (ticket is null)
        {
            return InvalidCode();
        }

        var user = await users.FindByIdAsync(ticket.UserId.ToString("D"));
        if (user is null)
        {
            return InvalidCode();
        }

        // Membership is re-verified at redemption for a tenant handoff: the
        // group may have changed (or the member removed) between issue and
        // redeem. An app-scope handoff has no group to authorize.
        if (ticket.GroupId is { } groupId)
        {
            try
            {
                await access.RequireMemberAsync(groupId, ticket.UserId, cancellationToken);
            }
            catch (Exception ex) when (ex is NotFoundException or ForbiddenException)
            {
                return InvalidCode();
            }
        }

        await signInManager.SignInAsync(user, isPersistent: false, authenticationMethod: null);
        return Results.Ok(new { redirect = "/" });
    }

    private static IResult InvalidCode() =>
        Results.Problem(
            detail: InvalidCodeDetail,
            statusCode: StatusCodes.Status400BadRequest);

    private static Guid? ResolveUserId(ClaimsPrincipal principal)
    {
        if (principal.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        var claim = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    /// <summary>
    /// Builds <c>{scheme}://{subdomain}.{apexHost}:{port}/session/handoff?code=…</c>
    /// from the registered apex origin, preserving scheme and non-default port.
    /// Falls back to the request's own scheme/host when no apex origin is
    /// configured (local development / tests).
    /// </summary>
    private static string BuildHandoffRedirect(
        IPublicOrigin origin,
        HttpContext http,
        string subdomain,
        string code)
    {
        var apex = origin.GetOrigin();
        if (!Uri.TryCreate(apex, UriKind.Absolute, out var apexUri))
        {
            apexUri = new Uri($"{http.Request.Scheme}://{http.Request.Host.Value}");
        }

        var targetHost = $"{subdomain.ToLowerInvariant()}.{apexUri.Host}";
        var builder = new UriBuilder(
            apexUri.Scheme,
            targetHost,
            apexUri.IsDefaultPort ? -1 : apexUri.Port);

        var authority = builder.Uri.GetLeftPart(UriPartial.Authority);
        return $"{authority}/session/handoff?code={Uri.EscapeDataString(code)}";
    }
}

/// <summary>
/// Handoff request. <see cref="Slug"/> is the tenant slug, or null/blank for an
/// app-scope handoff to the product host.
/// </summary>
public sealed record SessionHandoffStartRequest(string? Slug);

public sealed record SessionHandoffRedeemRequest(string? Code);
