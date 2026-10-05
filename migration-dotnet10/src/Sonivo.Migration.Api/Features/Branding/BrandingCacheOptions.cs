namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// Output-cache tuning for the public branding endpoint. Uses the C# 14
/// <c>field</c> keyword so validation lives next to the backing storage without
/// a hand-written private field.
/// </summary>
public sealed class BrandingCacheOptions
{
    public const string SectionName = "Branding:Cache";

    public BrandingCacheOptions()
    {
        DurationSeconds = 30;
    }

    /// <summary>Cache lifetime in seconds (1..3600).</summary>
    public int DurationSeconds
    {
        get => field;
        set => field = value is >= 1 and <= 3600
            ? value
            : throw new ArgumentOutOfRangeException(
                nameof(value), value, "DurationSeconds must be between 1 and 3600.");
    }
}
