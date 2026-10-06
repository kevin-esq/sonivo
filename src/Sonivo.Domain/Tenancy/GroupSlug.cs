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

    /// <summary>
    /// Segments that must never become a tenant path or host (ADR-0047/ADR-0067):
    /// one reservation protects both <c>/g/{slug}</c> path tenancy and the
    /// <c>{slug}.sonivo.lat</c> host map (apex, app, account, api, www, staging,
    /// infrastructure and reserved product routes). Keep in sync with the host
    /// map in <c>docs/03-architecture/DEPLOYMENT.md</c>; the server list is
    /// authoritative and the client mirror is UX only.
    /// </summary>
    private static readonly HashSet<string> Reserved = new(StringComparer.Ordinal)
    {
        "account", "admin", "api", "app", "assets", "auth", "billing", "blog",
        "cdn", "cuenta", "dashboard", "dev", "docs", "error", "favicon", "g",
        "group", "groups", "health", "help", "internal", "join", "login",
        "logout", "mail", "manifest", "panel", "privacy", "register", "robots",
        "settings", "signup", "sitemap", "smtp", "staging", "static", "status",
        "support", "system", "terms", "test", "www"
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
