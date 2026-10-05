namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// C# 14 extension members: expose derived asset paths directly on
/// <see cref="TenantBranding"/> without polluting the persistence record with
/// URL-shaping logic.
/// </summary>
internal static class TenantBrandingExtensions
{
    extension(TenantBranding branding)
    {
        public string? LogoPath =>
            branding.HasLogo ? $"/api/v1/tenants/{branding.Slug}/branding/logo" : null;

        public string? BannerPath =>
            branding.HasBanner ? $"/api/v1/tenants/{branding.Slug}/branding/banner" : null;

        public string? FaviconPath =>
            branding.HasFavicon ? $"/api/v1/tenants/{branding.Slug}/branding/favicon" : null;
    }
}
