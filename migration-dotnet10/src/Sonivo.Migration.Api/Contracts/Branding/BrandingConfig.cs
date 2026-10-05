namespace Sonivo.Migration.Api.Contracts.Branding;

/// <summary>
/// Resolved brand identity for a tenant. Hex values are always 6-digit
/// <c>#rrggbb</c> strings (or null when the tenant keeps the platform default).
/// The <c>On*</c> values are the WCAG AA-safe foreground for each surface, so
/// the frontend never has to recompute contrast.
/// </summary>
public sealed record BrandingConfig
{
    public string? DisplayName { get; init; }

    public string? PrimaryHex { get; init; }
    public string? SecondaryHex { get; init; }
    public string? AccentHex { get; init; }

    public string? OnPrimary { get; init; }
    public string? OnSecondary { get; init; }
    public string? OnAccent { get; init; }

    public string? SuccessHex { get; init; }
    public string? WarningHex { get; init; }
    public string? ErrorHex { get; init; }

    /// <summary>Display-face id from the curated allowlist (e.g. <c>inter</c>).</summary>
    public string? Typography { get; init; }

    /// <summary>Preferred theme: <c>light</c>, <c>dark</c> or <c>system</c>.</summary>
    public string? ThemeDefault { get; init; }

    /// <summary>Cover strategy: <c>emoji</c> or <c>gradient</c>.</summary>
    public string? CoverKind { get; init; }

    public string? CoverValue { get; init; }

    /// <summary>Whether the "Powered by Sonivo" credit should render.</summary>
    public bool ShowPlatformCredit { get; init; }

    /// <summary>Monotonic brand version; useful as a cache key / ETag seed.</summary>
    public int Version { get; init; }

    /// <summary>Last time the brand was changed (UTC).</summary>
    public DateTimeOffset UpdatedAt { get; init; }

    public required BrandingLinks Links { get; init; }
}
