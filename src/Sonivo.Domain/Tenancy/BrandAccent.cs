using System.Globalization;
using System.Text.RegularExpressions;

namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Server-side accent-colour policy for per-group white label (ADR-0048): only a
/// 6-digit hex is accepted (never free CSS) and it must reach WCAG AA against at
/// least one of the text colours the accent is used with.
/// </summary>
public static partial class BrandAccent
{
    public static bool IsValidHex(string? value) =>
        value is not null && HexPattern().IsMatch(value);

    public static string Normalize(string value) => "#" + value[1..].ToLowerInvariant();

    /// <summary>
    /// The accent is used as a surface behind white text (header/nav) and as
    /// link/text colour on the light surface, so it must reach WCAG AA (>= 4.5:1)
    /// against white.
    /// </summary>
    public static bool MeetsAa(string hex) => Contrast(hex, "#ffffff") >= 4.5;

    public static double Contrast(string hexA, string hexB)
    {
        var a = RelativeLuminance(hexA);
        var b = RelativeLuminance(hexB);
        var lighter = Math.Max(a, b);
        var darker = Math.Min(a, b);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private static double RelativeLuminance(string hex)
    {
        var r = Linear(hex, 1);
        var g = Linear(hex, 3);
        var b = Linear(hex, 5);
        return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    }

    private static double Linear(string hex, int offset)
    {
        var value = int.Parse(hex.Substring(offset, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture) / 255.0;
        return value <= 0.03928 ? value / 12.92 : Math.Pow((value + 0.055) / 1.055, 2.4);
    }

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexPattern();
}
