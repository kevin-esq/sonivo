using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Auth;

public static class GoogleAuthSetup
{
    public const string NextItemKey = "sonivo.next";
    public const string CallbackPath = "/api/auth/google/response";
    public const string CompletePath = "/api/auth/google/callback";

    public static bool IsGoogleConfigured(IConfiguration configuration)
    {
        var clientId = configuration["Authentication:Google:ClientId"];
        var clientSecret = configuration["Authentication:Google:ClientSecret"];
        return !string.IsNullOrWhiteSpace(clientId) && !string.IsNullOrWhiteSpace(clientSecret);
    }

    public static void AddGoogleExternalLogin(this IServiceCollection services, IConfiguration configuration)
    {
        if (!IsGoogleConfigured(configuration))
        {
            return;
        }

        services.AddAuthentication()
            .AddGoogle(options =>
            {
                options.ClientId = configuration["Authentication:Google:ClientId"]!;
                options.ClientSecret = configuration["Authentication:Google:ClientSecret"]!;
                options.CallbackPath = CallbackPath;
                options.Scope.Clear();
                options.Scope.Add("openid");
                options.Scope.Add("email");
                options.Scope.Add("profile");
                options.SaveTokens = false;
                options.ClaimActions.MapJsonKey("email_verified", "email_verified");
            });
    }

    public static void MapGoogleAuthEndpoints(this WebApplication app)
    {
        var googleConfigured = IsGoogleConfigured(app.Configuration);
        var testHook = app.Configuration.GetValue("Authentication:Google:EnableTestHook", false);

        app.MapGet("/api/auth/providers", () => Results.Ok(new { google = googleConfigured }))
            .WithName("AuthProviders")
            .AllowAnonymous();

        app.MapGet("/api/auth/google", (
            HttpContext http,
            SignInManager<ApplicationUser> signInManager,
            [FromQuery] string? next) =>
        {
            if (!googleConfigured)
            {
                return Results.NotFound();
            }

            var safeNext = OAuthNext.Sanitize(next);
            var properties = signInManager.ConfigureExternalAuthenticationProperties(
                GoogleDefaults.AuthenticationScheme,
                CompletePath);
            if (safeNext is not null)
            {
                properties.Items[NextItemKey] = safeNext;
            }

            return Results.Challenge(properties, [GoogleDefaults.AuthenticationScheme]);
        })
        .WithName("GoogleChallenge")
        .AllowAnonymous();

        app.MapGet(CompletePath, async (
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> users) =>
        {
            if (!googleConfigured && !testHook)
            {
                return Results.NotFound();
            }

            var info = await signInManager.GetExternalLoginInfoAsync();
            if (info is null)
            {
                return Results.Problem(
                    detail: "External login information is missing.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Bad Request");
            }

            var completion = await ExternalLoginCompletion.CompleteAsync(info, users);
            if (!completion.Succeeded || completion.User is null)
            {
                return Results.Problem(
                    detail: completion.ErrorDetail ?? "External login failed.",
                    statusCode: completion.StatusCode,
                    title: completion.StatusCode == StatusCodes.Status403Forbidden ? "Forbidden" : "Bad Request");
            }

            await signInManager.SignInAsync(completion.User, isPersistent: true);

            string? storedNext = null;
            info.AuthenticationProperties?.Items.TryGetValue(NextItemKey, out storedNext);
            var next = OAuthNext.Sanitize(storedNext);
            return Results.Redirect(next ?? "/");
        })
        .WithName("GoogleCallback")
        .AllowAnonymous();

        if (testHook)
        {
            app.MapPost("/api/auth/google/test-callback", async (
                TestGoogleCallbackRequest request,
                SignInManager<ApplicationUser> signInManager,
                UserManager<ApplicationUser> users) =>
            {
                var claims = new List<Claim>
                {
                    new(ClaimTypes.NameIdentifier, request.ProviderKey),
                    new(ClaimTypes.Email, request.Email),
                    new("email_verified", request.EmailVerified ? "true" : "false")
                };
                if (!string.IsNullOrWhiteSpace(request.DisplayName))
                {
                    claims.Add(new Claim(ClaimTypes.Name, request.DisplayName.Trim()));
                }

                var identity = new ClaimsIdentity(claims, GoogleDefaults.AuthenticationScheme);
                var principal = new ClaimsPrincipal(identity);
                var info = new ExternalLoginInfo(
                    principal,
                    ExternalLoginCompletion.GoogleProvider,
                    request.ProviderKey,
                    "Google")
                {
                    AuthenticationProperties = new AuthenticationProperties()
                };

                var safeNext = OAuthNext.Sanitize(request.Next);
                if (safeNext is not null)
                {
                    info.AuthenticationProperties.Items[NextItemKey] = safeNext;
                }

                var completion = await ExternalLoginCompletion.CompleteAsync(info, users);
                if (!completion.Succeeded || completion.User is null)
                {
                    return Results.Problem(
                        detail: completion.ErrorDetail ?? "External login failed.",
                        statusCode: completion.StatusCode,
                        title: completion.StatusCode == StatusCodes.Status403Forbidden ? "Forbidden" : "Bad Request");
                }

                await signInManager.SignInAsync(completion.User, isPersistent: true);
                return Results.Ok(new
                {
                    id = completion.User.Id,
                    email = completion.User.Email,
                    displayName = completion.User.DisplayName,
                    emailConfirmed = completion.User.EmailConfirmed,
                    next = safeNext
                });
            })
            .WithName("GoogleTestCallback")
            .AllowAnonymous()
            .DisableAntiforgery();
        }
    }

    private sealed record TestGoogleCallbackRequest(
        string ProviderKey,
        string Email,
        bool EmailVerified,
        string? DisplayName,
        string? Next);
}
