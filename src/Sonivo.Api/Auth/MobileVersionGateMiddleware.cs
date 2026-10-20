namespace Sonivo.Api.Auth;

/// <summary>Enforces an operator-configured minimum version for identified native app requests.</summary>
internal sealed class MobileVersionGateMiddleware(RequestDelegate next)
{
    private const string PlatformHeader = "X-Sonivo-Platform";
    private const string VersionHeader = "X-Sonivo-App-Version";

    public static void ValidateConfiguration(IConfiguration configuration)
    {
        foreach (var platform in new[] { "Android", "iOS" })
        {
            var minimum = configuration[$"Authentication:Mobile:MinimumVersions:{platform}"];
            if (string.IsNullOrWhiteSpace(minimum)) continue;
            if (!Version.TryParse(minimum, out var version) || version.Build < 0 || version.Revision >= 0)
            {
                throw new InvalidOperationException(
                    $"Authentication:Mobile:MinimumVersions:{platform} must use a three-part version such as 1.2.3.");
            }

            var storeUrl = configuration[$"Authentication:Mobile:{platform}StoreUrl"];
            if (!Uri.TryCreate(storeUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            {
                throw new InvalidOperationException(
                    $"Authentication:Mobile:{platform}StoreUrl must be HTTPS when a minimum app version is configured.");
            }
        }
    }

    public async Task InvokeAsync(HttpContext context, IConfiguration configuration)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        if (path.Equals("/connect/authorize", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/.well-known/openid-configuration", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var isBearerRequest = context.Request.Headers.Authorization.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase);
        var isTokenExchange = path.Equals("/connect/token", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/connect/revoke", StringComparison.OrdinalIgnoreCase);
        var platform = context.Request.Headers[PlatformHeader].ToString();
        var (key, storeUrlKey) = platform.ToLowerInvariant() switch
        {
            "android" => ("Android", "AndroidStoreUrl"),
            "ios" => ("iOS", "iOSStoreUrl"),
            _ => (null, null)
        };

        if (key is null && (isBearerRequest || isTokenExchange))
        {
            await Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Mobile platform is required",
                detail: "A valid X-Sonivo-Platform header is required for mobile bearer requests.",
                extensions: new Dictionary<string, object?> { ["code"] = "mobile_platform_required" })
                .ExecuteAsync(context);
            return;
        }

        // Keep authentication and revocation available so an old install can
        // obtain a readable update response from its first protected API call
        // and can still revoke its refresh token during sign-out.
        if (path.Equals("/connect/token", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/connect/revoke", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var minimum = key is null ? null : configuration[$"Authentication:Mobile:MinimumVersions:{key}"];

        if (string.IsNullOrWhiteSpace(minimum))
        {
            await next(context);
            return;
        }

        var supplied = context.Request.Headers[VersionHeader].ToString();
        if (!Version.TryParse(minimum, out var minimumVersion)
            || minimumVersion.Build < 0 || minimumVersion.Revision >= 0
            || !Version.TryParse(supplied, out var appVersion)
            || appVersion.Build < 0 || appVersion.Revision >= 0)
        {
            await Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid mobile app version",
                detail: "A valid X-Sonivo-App-Version header is required.",
                extensions: new Dictionary<string, object?> { ["code"] = "mobile_version_invalid" })
                .ExecuteAsync(context);
            return;
        }

        if (appVersion < minimumVersion)
        {
            context.Response.Headers.CacheControl = "no-store";
            await Results.Problem(
                statusCode: StatusCodes.Status426UpgradeRequired,
                title: "Mobile app update required",
                detail: "Update Sonivo to continue.",
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = "mobile_update_required",
                    ["platform"] = key,
                    ["minimumVersion"] = minimumVersion.ToString(3),
                    ["storeUrl"] = configuration[$"Authentication:Mobile:{storeUrlKey}"]
                })
                .ExecuteAsync(context);
            return;
        }

        await next(context);
    }
}
