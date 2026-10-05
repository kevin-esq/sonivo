namespace Sonivo.Migration.Api.Contracts.Branding;

/// <summary>
/// Localized UI copy. Tenant-specific overrides win over catalog defaults, so a
/// tenant can personalize the welcome/login copy while the platform keeps
/// translating the rest of the shell.
/// </summary>
public sealed record BrandingTexts
{
    public required string Welcome { get; init; }
    public required string LoginHeadline { get; init; }
    public string? Tagline { get; init; }
    public string? Verse { get; init; }
    public required BrandingNavTexts Nav { get; init; }
}

/// <summary>Navigation labels cribbed for the tenant shell.</summary>
public sealed record BrandingNavTexts
{
    public required string Home { get; init; }
    public required string Library { get; init; }
    public required string Events { get; init; }
    public required string Members { get; init; }
}
