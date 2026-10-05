using Microsoft.AspNetCore.OutputCaching;

namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>Output-cache policy name + tag helpers.</summary>
internal static class BrandingCachePolicy
{
    public const string Name = "tenant-branding";
}

internal static class BrandingCacheTags
{
    public static string ForTenant(string slug) => $"tenant:{slug.ToLowerInvariant()}";

    public static string ForLocale(string locale) => $"locale:{locale.ToLowerInvariant()}";
}

/// <summary>
/// Output-cache policy for public branding reads. It varies the cache by the
/// <c>slug</c> route value and the resolved <c>lang</c>, and it tags each entry
/// with the tenant and locale so a brand update can evict exactly the affected
/// entries via <c>IOutputCacheStore.EvictByTagAsync</c> instead of flushing the
/// whole cache.
/// </summary>
internal sealed class TenantBrandingCachePolicy(BrandingCacheOptions options) : IOutputCachePolicy
{
    public ValueTask CacheRequestAsync(OutputCacheContext context, CancellationToken cancellationToken)
    {
        var request = context.HttpContext.Request;

        context.EnableOutputCaching = true;
        context.AllowCacheLookup = true;
        context.AllowCacheStorage = true;
        context.AllowLocking = true;
        context.ResponseExpirationTimeSpan = TimeSpan.FromSeconds(options.DurationSeconds);
        context.CacheVaryByRules.QueryKeys = "*";

        if (request.RouteValues.TryGetValue("slug", out var slug)
            && slug is string tenantSlug
            && tenantSlug.Length > 0)
        {
            context.Tags.Add(BrandingCacheTags.ForTenant(tenantSlug));
        }

        if (request.Query.TryGetValue("lang", out var lang) && lang.Count > 0)
        {
            context.Tags.Add(BrandingCacheTags.ForLocale(lang[0]!));
        }

        return ValueTask.CompletedTask;
    }

    public ValueTask ServeFromCacheAsync(OutputCacheContext context, CancellationToken cancellationToken) =>
        ValueTask.CompletedTask;

    public ValueTask ServeResponseAsync(OutputCacheContext context, CancellationToken cancellationToken) =>
        ValueTask.CompletedTask;
}
