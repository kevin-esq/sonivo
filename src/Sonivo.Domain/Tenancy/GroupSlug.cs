using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Rules for a Group's path slug (ADR-0048, D1): 3–40 chars, lowercase ASCII
/// letters/digits and single hyphens, never a reserved segment, never reused
/// after deletion (a deleted Group row keeps its Slug).
/// </summary>
public static partial class GroupSlug
{
    public const int MinLength = 3;
    public const int MaxLength = 40;

    /// <summary>Segments that must never become a tenant path (/g/{slug}).</summary>
    private static readonly HashSet<string> Reserved = new(StringComparer.Ordinal)
    {
        "api", "auth", "admin", "app", "account", "assets", "cuenta", "error",
        "favicon", "g", "group", "groups", "health", "help", "join", "login",
        "logout", "mail", "manifest", "privacy", "register", "robots", "settings",
        "sitemap", "static", "support", "terms", "www"
    };

    public static bool IsReserved(string slug) => Reserved.Contains(slug);

    public static bool IsValid(string slug)
    {
        if (slug.Length is < MinLength or > MaxLength)
        {
            return false;
        }

        if (IsReserved(slug))
        {
            return false;
        }

        return SlugPattern().IsMatch(slug);
    }

    /// <summary>
    /// Best-effort slug from a display name: strips diacritics, keeps [a-z0-9],
    /// collapses everything else into single hyphens, falls back to "grupo"
    /// and avoids the reserved list.
    /// </summary>
    public static string Slugify(string name)
    {
        var decomposed = (name ?? string.Empty).Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            builder.Append(char.ToLowerInvariant(ch));
        }

        var ascii = builder.ToString().Normalize(NormalizationForm.FormC);
        var slug = NonSlugCharacters().Replace(ascii, "-").Trim('-');
        if (slug.Length > MaxLength)
        {
            slug = slug[..MaxLength].Trim('-');
        }

        if (slug.Length < MinLength)
        {
            slug = "grupo";
        }

        if (IsReserved(slug))
        {
            slug = Truncate(slug, MaxLength - "-grupo".Length) + "-grupo";
        }

        return slug;
    }

    /// <summary>Appends a numeric suffix without exceeding the maximum length.</summary>
    public static string WithSuffix(string baseSlug, int suffix)
    {
        var tail = "-" + suffix.ToString(CultureInfo.InvariantCulture);
        return Truncate(baseSlug, MaxLength - tail.Length) + tail;
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max].Trim('-');

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    private static partial Regex SlugPattern();

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugCharacters();
}
