namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// Persistence-agnostic brand record. This is the read model the API projects
/// from; in the target architecture it is filled by an EF Core compiled query
/// against the tenant/branding tables, but any store can implement
/// <see cref="IBrandingReader"/>.
/// </summary>
public sealed record TenantBranding
{
    public required Guid TenantId { get; init; }
    public required string Slug { get; init; }

    public string? DisplayName { get; init; }

    public string? PrimaryHex { get; init; }
    public string? SecondaryHex { get; init; }
    public string? AccentHex { get; init; }
    public string? SuccessHex { get; init; }
    public string? WarningHex { get; init; }
    public string? ErrorHex { get; init; }

    public string? Typography { get; init; }
    public string? ThemeDefault { get; init; }
    public string? CoverKind { get; init; }
    public string? CoverValue { get; init; }

    public string? DefaultLocale { get; init; }

    // Tenant-authored copy that overrides the localized catalog defaults.
    public string? WelcomeText { get; init; }
    public string? LoginHeadline { get; init; }
    public string? Tagline { get; init; }
    public string? Verse { get; init; }

    public bool HasLogo { get; init; }
    public bool HasBanner { get; init; }
    public bool HasFavicon { get; init; }

    public bool ShowPlatformCredit { get; init; } = true;

    public int Version { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
}
