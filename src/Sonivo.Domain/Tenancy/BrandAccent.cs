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
    public const string White = "#ffffff";

    /// <summary>Near-black ink used when a light surface needs dark text (AA).</summary>
    public const string DarkInk = "#0f172a";

    public static bool IsValidHex(string? value) =>
        value is not null && HexPattern().IsMatch(value);

    public static string Normalize(string value) => "#" + value[1..].ToLowerInvariant();

    /// <summary>
    /// The primary accent is used as a surface behind white text (header/nav) and
    /// as link/text colour on the light surface, so it must reach WCAG AA
    /// (>= 4.5:1) against white. The text colour is therefore always white.
    /// </summary>
    public static bool MeetsAa(string hex) => Contrast(hex, White) >= 4.5;

    /// <summary>
    /// Secondary surfaces may be light or dark; accept the colour when either
    /// white or near-black reaches AA on top of it.
    /// </summary>
    public static bool MeetsAaWithAnyInk(string hex) =>
        Math.Max(Contrast(hex, White), Contrast(hex, DarkInk)) >= 4.5;

    /// <summary>Picks the text colour (white or near-black) with the higher AA contrast.</summary>
    public static string OnColor(string hex) =>
        Contrast(hex, White) >= Contrast(hex, DarkInk) ? White : DarkInk;

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
