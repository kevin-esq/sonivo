using System.Text.RegularExpressions;

namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// Syntactic tenant-slug validation. Mirrors the current slug rules: lowercase
/// alphanumerics and hyphens, 3..40 chars, cannot start or end with a hyphen.
/// Compiled with the regex source generator so no pattern parsing happens at
/// runtime.
/// </summary>
internal static partial class SlugValidator
{
    [GeneratedRegex("^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$", RegexOptions.CultureInvariant)]
    private static partial Regex SlugPattern { get; }

    public static bool IsValid(string? slug) => !string.IsNullOrEmpty(slug) && SlugPattern.IsMatch(slug);
}
