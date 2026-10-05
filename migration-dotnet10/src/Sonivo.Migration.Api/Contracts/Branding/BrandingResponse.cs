namespace Sonivo.Migration.Api.Contracts.Branding;

/// <summary>
/// Public branding payload consumed by the Next.js tenant resolver. It carries
/// the tenant's brand configuration (colors, logo, theme) plus the localized UI
/// copy the frontend should render for the resolved locale.
/// </summary>
public sealed record BrandingResponse
{
    /// <summary>Case-normalized tenant slug the payload was resolved for.</summary>
    public required string TenantSlug { get; init; }

    /// <summary>Locale actually used to build <see cref="Texts"/>.</summary>
    public required string Locale { get; init; }

    /// <summary>Locales the platform can render, ordered by priority.</summary>
    public required IReadOnlyList<string> SupportedLocales { get; init; }

    /// <summary>Brand identity: colors, on-colors, typography and asset links.</summary>
    public required BrandingConfig Branding { get; init; }

    /// <summary>Localized UI copy (tenant overrides already applied).</summary>
    public required BrandingTexts Texts { get; init; }
}
