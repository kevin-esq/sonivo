using System.Collections.Frozen;
using System.Globalization;

namespace Sonivo.Migration.Api.Features.Branding;

/// <summary>Default (non-tenant) UI strings for one locale.</summary>
public sealed record LocalizedTextDefaults(
    string Welcome,
    string LoginHeadline,
    string NavHome,
    string NavLibrary,
    string NavEvents,
    string NavMembers);

/// <summary>
/// In-process localization catalog. Spanish is the platform default; English
/// and Portuguese are first-class. The catalog is a frozen lookup so locale
/// negotiation never allocates or scans.
/// </summary>
public static class BrandingTextCatalog
{
    public const string DefaultLocale = "es";

    /// <summary>Supported locales, ordered by priority for content negotiation.</summary>
    public static readonly IReadOnlyList<string> SupportedLocales = ["es", "en", "pt"];

    private static readonly FrozenDictionary<string, LocalizedTextDefaults> Catalog =
        new Dictionary<string, LocalizedTextDefaults>(StringComparer.OrdinalIgnoreCase)
        {
            ["es"] = new("Bienvenido", "Inicia sesión", "Inicio", "Biblioteca", "Eventos", "Miembros"),
            ["en"] = new("Welcome", "Sign in", "Home", "Library", "Events", "Members"),
            ["pt"] = new("Bem-vindo", "Entrar", "Início", "Biblioteca", "Eventos", "Membros"),
        }.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Resolves the effective locale using, in order: explicit <c>?lang=</c>,
    /// <c>Accept-Language</c> (q-ordered), the tenant's default locale, then the
    /// platform default.
    /// </summary>
    public static string ResolveLocale(string? requested, string? acceptLanguage, string? tenantDefault)
    {
        if (TryNormalize(requested, out var explicitLocale))
        {
            return explicitLocale;
        }

        foreach (var candidate in ParseAcceptLanguage(acceptLanguage))
        {
            if (TryNormalize(candidate, out var negotiated))
            {
                return negotiated;
            }
        }

        if (TryNormalize(tenantDefault, out var tenantLocale))
        {
            return tenantLocale;
        }

        return DefaultLocale;
    }

    public static LocalizedTextDefaults ForLocale(string locale) =>
        Catalog.TryGetValue(locale, out var texts) ? texts : Catalog[DefaultLocale];

    private static bool TryNormalize(string? value, out string locale)
    {
        locale = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        // Accept region subtags ("pt-BR") but match on the primary language.
        var primary = value.Trim().Split('-')[0].ToLowerInvariant();
        if (Catalog.ContainsKey(primary))
        {
            locale = primary;
            return true;
        }

        return false;
    }

    private static IEnumerable<string> ParseAcceptLanguage(string? header)
    {
        if (string.IsNullOrWhiteSpace(header))
        {
            return [];
        }

        return header
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(static part =>
            {
                var segments = part.Split(';', StringSplitOptions.TrimEntries);
                var tag = segments[0];
                var quality = 1d;
                if (segments.Length > 1
                    && segments[1].StartsWith("q=", StringComparison.OrdinalIgnoreCase))
                {
                    _ = double.TryParse(
                        segments[1].AsSpan(2), NumberStyles.Float, CultureInfo.InvariantCulture, out quality);
                }

                return (Tag: tag, Quality: quality);
            })
            .OrderByDescending(static entry => entry.Quality)
            .Select(static entry => entry.Tag);
    }
}
