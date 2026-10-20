using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using OpenIddict.Abstractions;
using OpenIddict.Validation.AspNetCore;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Auth;

internal static class MobileAuthenticationSetup
{
    public const string Scheme = "Sonivo.CookieOrBearer";
    public const string AuthorizationPolicy = "oidc-authorization";
    public const string TokenPolicy = "oidc-token";

    public static bool IsEnabled(IConfiguration configuration) =>
        configuration.GetValue("Authentication:Mobile:Enabled", false);

    public static void ConfigureAuthentication(AuthenticationOptions options, bool enabled)
    {
        options.DefaultScheme = enabled ? Scheme : IdentityConstants.ApplicationScheme;
        options.DefaultAuthenticateScheme = options.DefaultScheme;
        options.DefaultChallengeScheme = options.DefaultScheme;
        options.DefaultSignInScheme = IdentityConstants.ExternalScheme;
    }

    public static void AddServices(
        IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        if (!IsEnabled(configuration))
        {
            return;
        }

        var issuerValue = configuration["Authentication:Mobile:Issuer"];
        if (!Uri.TryCreate(issuerValue, UriKind.Absolute, out var issuer)
            || issuer.Scheme is not ("https" or "http")
            || (!environment.IsDevelopment() && issuer.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException(
                "Authentication:Mobile:Issuer must be an absolute HTTPS issuer outside Development.");
        }

        services.AddOpenIddict()
            .AddCore(options =>
            {
                options.UseEntityFrameworkCore()
                    .UseDbContext<SonivoDbContext>()
                    .ReplaceDefaultEntities<Guid>();
            })
            .AddServer(options =>
            {
                options.SetIssuer(issuer)
                    .SetAuthorizationEndpointUris("connect/authorize")
                    .SetTokenEndpointUris("connect/token")
                    .SetRevocationEndpointUris("connect/revoke");

                options.AllowAuthorizationCodeFlow()
                    .AllowRefreshTokenFlow()
                    .RequireProofKeyForCodeExchange();

                options.RegisterScopes(
                    OpenIddictConstants.Scopes.Email,
                    OpenIddictConstants.Scopes.Profile,
                    OpenIddictConstants.Scopes.OfflineAccess,
                    "sonivo_api");

                options.SetAccessTokenLifetime(TimeSpan.FromMinutes(5))
                    .SetRefreshTokenLifetime(TimeSpan.FromDays(30));

                if (environment.IsDevelopment())
                {
                    options.AddDevelopmentSigningCertificate()
                        .AddDevelopmentEncryptionCertificate();
                }
                else
                {
                    var signingCertificate = LoadCertificate(configuration, "Signing");
                    var encryptionCertificate = LoadCertificate(configuration, "Encryption");
                    options.AddSigningCertificate(signingCertificate)
                        .AddEncryptionCertificate(encryptionCertificate);
                }

                var aspNetCore = options.UseAspNetCore()
                    .EnableAuthorizationEndpointPassthrough();
                if (environment.IsDevelopment())
                {
                    aspNetCore.DisableTransportSecurityRequirement();
                }
            })
            .AddValidation(options =>
            {
                options.UseLocalServer();
                options.EnableTokenEntryValidation();
                options.EnableAuthorizationEntryValidation();
                options.UseAspNetCore();
            });
    }

    public static void AddBearerForwarding(AuthenticationBuilder authentication, bool enabled)
    {
        if (!enabled)
        {
            authentication.AddIdentityCookies();
            return;
        }

        authentication.AddPolicyScheme(Scheme, Scheme, options =>
        {
            options.ForwardDefaultSelector = context =>
                context.Request.Headers.Authorization.ToString().StartsWith(
                    "Bearer ", StringComparison.OrdinalIgnoreCase)
                    ? OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme
                    : IdentityConstants.ApplicationScheme;
        });
        authentication.AddIdentityCookies();
    }

    private static X509Certificate2 LoadCertificate(IConfiguration configuration, string purpose)
    {
        var path = configuration[$"Authentication:Mobile:{purpose}CertificatePath"];
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            throw new InvalidOperationException(
                $"Authentication:Mobile:{purpose}CertificatePath must point to a configured certificate when mobile authentication is enabled outside Development.");
        }

        var password = configuration[$"Authentication:Mobile:{purpose}CertificatePassword"];
        return X509CertificateLoader.LoadPkcs12FromFile(
            path,
            password,
            X509KeyStorageFlags.EphemeralKeySet);
    }
}
