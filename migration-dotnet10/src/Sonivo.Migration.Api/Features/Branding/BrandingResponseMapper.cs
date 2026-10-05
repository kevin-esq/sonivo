using Sonivo.Migration.Api.Contracts.Branding;

namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// Projects the persistence read model into the public API contract, applying
/// locale negotiation and contrast derivation. Kept separate from the endpoint
/// so it can be unit-tested without an HTTP pipeline.
/// </summary>
internal static class BrandingResponseMapper
{
    public static BrandingResponse ToResponse(TenantBranding branding, string locale)
    {
        var defaults = BrandingTextCatalog.ForLocale(locale);

        return new BrandingResponse
        {
            TenantSlug = branding.Slug,
            Locale = locale,
            SupportedLocales = BrandingTextCatalog.SupportedLocales,
            Branding = new BrandingConfig
            {
                DisplayName = branding.DisplayName,
                PrimaryHex = branding.PrimaryHex,
                SecondaryHex = branding.SecondaryHex,
                AccentHex = branding.AccentHex,
                OnPrimary = BrandingColorMath.OnColor(branding.PrimaryHex),
                OnSecondary = BrandingColorMath.OnColor(branding.SecondaryHex),
                OnAccent = BrandingColorMath.OnColor(branding.AccentHex),
                SuccessHex = branding.SuccessHex,
                WarningHex = branding.WarningHex,
                ErrorHex = branding.ErrorHex,
                Typography = branding.Typography,
                ThemeDefault = branding.ThemeDefault,
                CoverKind = branding.CoverKind,
                CoverValue = branding.CoverValue,
                ShowPlatformCredit = branding.ShowPlatformCredit,
                Version = branding.Version,
                UpdatedAt = branding.UpdatedAt,
                Links = new BrandingLinks
                {
                    Logo = branding.LogoPath,
                    Banner = branding.BannerPath,
                    Favicon = branding.FaviconPath,
                },
            },
            Texts = new BrandingTexts
            {
                // Tenant-authored copy wins; the catalog fills the rest.
                Welcome = branding.WelcomeText ?? defaults.Welcome,
                LoginHeadline = branding.LoginHeadline ?? defaults.LoginHeadline,
                Tagline = branding.Tagline,
                Verse = branding.Verse,
                Nav = new BrandingNavTexts
                {
                    Home = defaults.NavHome,
                    Library = defaults.NavLibrary,
                    Events = defaults.NavEvents,
                    Members = defaults.NavMembers,
                },
            },
        };
    }
}
