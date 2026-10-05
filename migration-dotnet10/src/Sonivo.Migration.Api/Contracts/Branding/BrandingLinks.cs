namespace Sonivo.Migration.Api.Contracts.Branding;

/// <summary>
/// Absolute-path asset links. Null means the tenant has not uploaded that asset
/// (or branding is disabled for the tenant).
/// </summary>
public sealed record BrandingLinks
{
    public string? Logo { get; init; }
    public string? Banner { get; init; }
    public string? Favicon { get; init; }
}
