using System.Globalization;
using System.Text.RegularExpressions;

namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>
/// Deterministic WCAG 2.1 contrast math, ported from the current web brand
/// token derivation so the server can emit AA-safe "on" colors that match what
/// the frontend used to compute client-side. Pure functions only.
/// </summary>
internal static partial class BrandingColorMath
{
    private const string White = "#ffffff";
    private const string NearBlack = "#0f172a";

    [GeneratedRegex("^#?[0-9a-fA-F]{6}$", RegexOptions.CultureInvariant)]
    private static partial Regex HexPattern { get; }

    public static bool IsValidHex(string? value) => value is not null && HexPattern.IsMatch(value);

    /// <summary>
    /// Picks white or near-black for text rendered on top of <paramref name="hex"/>,
    /// whichever yields the higher contrast ratio. Returns null for invalid input.
    /// </summary>
    public static string? OnColor(string? hex)
    {
        if (!IsValidHex(hex))
        {
            return null;
        }

        var normalized = hex!.StartsWith('#') ? hex : string.Concat("#", hex);
        return ContrastRatio(normalized, White) >= ContrastRatio(normalized, NearBlack)
            ? White
            : NearBlack;
    }

    public static double ContrastRatio(string foreground, string background)
    {
        var a = RelativeLuminance(foreground);
        var b = RelativeLuminance(background);
        var (lighter, darker) = a >= b ? (a, b) : (b, a);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private static double RelativeLuminance(string hex)
    {
        var value = hex.TrimStart('#');
        if (value.Length != 6
            || !int.TryParse(value.AsSpan(0, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var r)
            || !int.TryParse(value.AsSpan(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var g)
            || !int.TryParse(value.AsSpan(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var b))
        {
            return 0d;
        }

        static double Linearize(int channel)
        {
            var c = channel / 255d;
            return c <= 0.03928 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
        }

        return (0.2126 * Linearize(r)) + (0.7152 * Linearize(g)) + (0.0722 * Linearize(b));
    }
}
