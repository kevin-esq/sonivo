using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using OpenIddict.Abstractions;
using OpenIddict.Server.AspNetCore;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Auth;

internal static class MobileAuthorizationEndpoints
{
    private static readonly string[] AllowedScopes =
    [
        OpenIddictConstants.Scopes.OpenId,
        OpenIddictConstants.Scopes.Profile,
        OpenIddictConstants.Scopes.Email,
        OpenIddictConstants.Scopes.OfflineAccess,
        "sonivo_api"
    ];

    public static void MapMobileAuthorizationEndpoints(this WebApplication app)
    {
        if (!MobileAuthenticationSetup.IsEnabled(app.Configuration))
        {
            return;
        }

        app.MapGet("/connect/authorize", AuthorizeAsync)
            .WithName("MobileAuthorize")
            .AllowAnonymous()
            .RequireRateLimiting(MobileAuthenticationSetup.AuthorizationPolicy);

        // OpenIddict handles these protocol endpoints in authentication middleware.
        // Mapped endpoints supply rate-limit metadata and are not executed on valid protocol requests.
        app.MapPost("/connect/token", () => Results.NotFound())
            .AllowAnonymous()
            .RequireRateLimiting(MobileAuthenticationSetup.TokenPolicy);
        app.MapPost("/connect/revoke", () => Results.NotFound())
            .AllowAnonymous()
            .RequireRateLimiting(MobileAuthenticationSetup.TokenPolicy);
    }

    private static async Task<IResult> AuthorizeAsync(
        HttpContext context,
        UserManager<ApplicationUser> users,
        IConfiguration configuration,
        CancellationToken cancellationToken)
    {
        var request = Microsoft.AspNetCore.OpenIddictServerAspNetCoreHelpers.GetOpenIddictServerRequest(context);
        if (request is null)
        {
            return Results.BadRequest();
        }

        var authentication = await context.AuthenticateAsync(IdentityConstants.ApplicationScheme);
        if (authentication.Principal is null || !authentication.Succeeded)
        {
            var loginPath = configuration["Authentication:Mobile:LoginPath"] ?? "/auth/login";
            if (!loginPath.StartsWith("/", StringComparison.Ordinal)
                || loginPath.StartsWith("//", StringComparison.Ordinal)
                || loginPath.Contains('\\'))
            {
                throw new InvalidOperationException("Authentication:Mobile:LoginPath must be a same-origin absolute path.");
            }

            var next = $"{context.Request.PathBase}{context.Request.Path}{context.Request.QueryString}";
            return Results.Redirect(QueryHelpers.AddQueryString(loginPath, "next", next));
        }

        var user = await users.GetUserAsync(authentication.Principal);
        if (user is null || !user.EmailConfirmed || user.MustChangePassword)
        {
            return Results.Forbid();
        }

        var scopes = request.GetScopes()
            .Where(scope => AllowedScopes.Contains(scope, StringComparer.Ordinal))
            .ToArray();

        var identity = new ClaimsIdentity(
            OpenIddictServerAspNetCoreDefaults.AuthenticationScheme,
            OpenIddictConstants.Claims.Name,
            OpenIddictConstants.Claims.Role);
        var subject = user.Id.ToString("D");
        identity.AddClaim(new Claim(OpenIddictConstants.Claims.Subject, subject));
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, subject));

        if (scopes.Contains(OpenIddictConstants.Scopes.Profile, StringComparer.Ordinal))
        {
            var name = string.IsNullOrWhiteSpace(user.DisplayName) ? user.UserName : user.DisplayName;
            if (!string.IsNullOrWhiteSpace(name))
            {
                identity.AddClaim(new Claim(OpenIddictConstants.Claims.Name, name));
            }
        }

        if (scopes.Contains(OpenIddictConstants.Scopes.Email, StringComparer.Ordinal)
            && !string.IsNullOrWhiteSpace(user.Email))
        {
            identity.AddClaim(new Claim(OpenIddictConstants.Claims.Email, user.Email));
            identity.AddClaim(new Claim(OpenIddictConstants.Claims.EmailVerified, user.EmailConfirmed ? "true" : "false"));
        }

        foreach (var claim in identity.Claims)
        {
            claim.SetDestinations(claim.Type switch
            {
                OpenIddictConstants.Claims.Subject or ClaimTypes.NameIdentifier =>
                [OpenIddictConstants.Destinations.AccessToken, OpenIddictConstants.Destinations.IdentityToken],
                OpenIddictConstants.Claims.Name when scopes.Contains(OpenIddictConstants.Scopes.Profile, StringComparer.Ordinal) =>
                [OpenIddictConstants.Destinations.IdentityToken],
                OpenIddictConstants.Claims.Email or OpenIddictConstants.Claims.EmailVerified
                    when scopes.Contains(OpenIddictConstants.Scopes.Email, StringComparer.Ordinal) =>
                [OpenIddictConstants.Destinations.IdentityToken],
                _ => []
            });
        }

        var principal = new ClaimsPrincipal(identity);
        principal.SetScopes(scopes);
        principal.SetResources("sonivo_api");

        return Results.SignIn(
            principal,
            properties: null,
            authenticationScheme: OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
    }
}
