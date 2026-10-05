using System.Net;
using Microsoft.AspNetCore.Http.HttpResults;
using Sonivo.Migration.Api.Contracts.Branding;

namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// Minimal API surface for tenant branding. Public and anonymous: the payload is
/// required to render a branded login screen before the user authenticates.
/// </summary>
public static class BrandingEndpoints
{
    public static IEndpointRouteBuilder MapBrandingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var tenants = endpoints.MapGroup("/api/v1/tenants").WithTags("Tenant branding");

        tenants.MapGet("/{slug}/branding", GetBrandingAsync)
            .WithName("GetTenantBranding")
            .WithSummary("Returns a tenant's branding and localized UI copy.")
            .WithDescription(
                "Resolves the slug to a tenant and returns brand configuration (colors, logo, "
                + "theme) plus UI texts for the negotiated locale. Spanish is the default.")
            .Produces<BrandingResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .AllowAnonymous()
            .CacheOutput(BrandingCachePolicy.Name)
            .RequireRateLimiting("branding-read");

        tenants.MapGet("/{slug}/branding/logo", GetLogoAsync)
            .WithName("GetTenantBrandingLogo")
            .WithSummary("Returns the tenant logo as an SVG placeholder.")
            .Produces(StatusCodes.Status200OK, contentType: "image/svg+xml")
            .ProducesProblem(StatusCodes.Status404NotFound)
            .AllowAnonymous()
            .CacheOutput(BrandingCachePolicy.Name)
            .RequireRateLimiting("branding-read");

        return endpoints;
    }

    private static async Task<Results<Ok<BrandingResponse>, ProblemHttpResult>> GetBrandingAsync(
        string slug,
        string? lang,
        HttpContext httpContext,
        IBrandingReader reader,
        ILogger<BrandingLogCategory> logger,
        CancellationToken cancellationToken)
    {
        if (!SlugValidator.IsValid(slug))
        {
            BrandingLog.InvalidSlug(logger, slug);
            return TypedResults.Problem(
                title: "Invalid tenant slug",
                detail: "The slug must be 3-40 characters using lowercase letters, digits and hyphens.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var branding = await reader.FindBySlugAsync(slug, cancellationToken);
        if (branding is null)
        {
            BrandingLog.TenantNotFound(logger, slug);
            return TypedResults.Problem(
                title: "Tenant not found",
                detail: $"No tenant is registered with slug '{slug}'.",
                statusCode: StatusCodes.Status404NotFound);
        }

        var locale = BrandingTextCatalog.ResolveLocale(
            lang,
            httpContext.Request.Headers.AcceptLanguage.ToString(),
            branding.DefaultLocale);

        BrandingLog.BrandingServed(logger, branding.Slug, locale);
        return TypedResults.Ok(BrandingResponseMapper.ToResponse(branding, locale));
    }

    private static async Task<Results<ContentHttpResult, ProblemHttpResult>> GetLogoAsync(
        string slug,
        IBrandingReader reader,
        CancellationToken cancellationToken)
    {
        if (!SlugValidator.IsValid(slug))
        {
            return TypedResults.Problem(
                title: "Invalid tenant slug",
                detail: "The slug must be 3-40 characters using lowercase letters, digits and hyphens.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var branding = await reader.FindBySlugAsync(slug, cancellationToken);
        if (branding is null || !branding.HasLogo)
        {
            return TypedResults.Problem(
                title: "Logo not found",
                detail: $"Tenant '{slug}' has no logo.",
                statusCode: StatusCodes.Status404NotFound);
        }

        var primary = branding.PrimaryHex ?? "#6d4ee0";
        var ink = BrandingColorMath.OnColor(primary) ?? "#ffffff";
        var initials = BuildInitials(branding.DisplayName ?? branding.Slug);
        var label = WebUtility.HtmlEncode(initials);

        // Deterministic placeholder so the endpoint is runnable without a blob
        // store. A real deployment streams the tenant's stored asset instead.
        var svg = $"""
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="{label}">
              <rect width="128" height="128" rx="28" fill="{primary}"/>
              <text x="64" y="64" dy="0.35em" text-anchor="middle"
                    font-family="system-ui, -apple-system, Segoe UI, sans-serif"
                    font-size="52" font-weight="700" fill="{ink}">{label}</text>
            </svg>
            """;

        return TypedResults.Content(svg, "image/svg+xml");
    }

    private static string BuildInitials(string source)
    {
        var words = source.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return words.Length switch
        {
            0 => "SO",
            1 => words[0].Length >= 2 ? words[0][..2].ToUpperInvariant() : words[0].ToUpperInvariant(),
            _ => string.Concat(char.ToUpperInvariant(words[0][0]), char.ToUpperInvariant(words[1][0])),
        };
    }
}
