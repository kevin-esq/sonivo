namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>Log category marker for branding endpoints.</summary>
internal sealed class BrandingLogCategory
{
}

/// <summary>
/// Source-generated, allocation-free log messages (CA1848-compliant).
/// </summary>
internal static partial class BrandingLog
{
    [LoggerMessage(
        EventId = 1000,
        Level = LogLevel.Information,
        Message = "Served branding for tenant {TenantSlug} in locale {Locale}.")]
    public static partial void BrandingServed(ILogger logger, string tenantSlug, string locale);

    [LoggerMessage(
        EventId = 1001,
        Level = LogLevel.Warning,
        Message = "Branding requested for unknown tenant {TenantSlug}.")]
    public static partial void TenantNotFound(ILogger logger, string tenantSlug);

    [LoggerMessage(
        EventId = 1002,
        Level = LogLevel.Warning,
        Message = "Branding requested with an invalid slug {TenantSlug}.")]
    public static partial void InvalidSlug(ILogger logger, string? tenantSlug);
}
