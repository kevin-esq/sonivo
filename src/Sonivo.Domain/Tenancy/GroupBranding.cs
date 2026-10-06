using Sonivo.Domain.Common;

namespace Sonivo.Domain.Tenancy;

/// <summary>
/// Per-group white-label settings (ADR-0048). Keyed by GroupId so it can be
/// re-keyed to an Organization later. Text is stored plain (React escapes on
/// render) but control characters are rejected; colours are validated by
/// <see cref="BrandAccent"/> and never stored as free CSS.
/// </summary>
public sealed class GroupBranding : IVersionedEntity
{
    public const int MaxDisplayNameLength = 120;
    public const int MaxTextLength = 500;
    public const int MaxTaglineLength = 160;
    public const int MaxVerseLength = 200;
    public const int MaxCoverValueLength = 32;

    private static readonly string[] CoverKinds = ["emoji", "gradient"];
    private static readonly string[] Themes = ["light", "dark", "system"];
    private static readonly string[] Locales = ["es", "en"];
    // Curated display faces (ADR-0070). Kept in sync with the web
    // TYPOGRAPHY_OPTIONS allowlist; 'system' is the default (no display face).
    private static readonly string[] Typographies =
        ["system", "rounded", "inter", "dmsans", "poppins", "space", "serif", "lora", "playfair", "mono"];

    public Guid GroupId { get; private set; }
    public string? DisplayName { get; private set; }
    public string? AccentHex { get; private set; }
    public string? SecondaryHex { get; private set; }
    public string? AccentColorHex { get; private set; }
    public string? SuccessHex { get; private set; }
    public string? WarningHex { get; private set; }
    public string? ErrorHex { get; private set; }
    public string? Typography { get; private set; }
    public string? CoverKind { get; private set; }
    public string? CoverValue { get; private set; }
    public string? ThemeDefault { get; private set; }
    public string? DefaultLocale { get; private set; }
    public string? WelcomeText { get; private set; }
    public string? LoginHeadline { get; private set; }
    public string? Tagline { get; private set; }
    public string? Verse { get; private set; }
    public string? LogoBlobKey { get; private set; }
    public string? LogoContentType { get; private set; }
    public string? BannerBlobKey { get; private set; }
    public string? BannerContentType { get; private set; }
    public string? FaviconBlobKey { get; private set; }
    public string? FaviconContentType { get; private set; }
    public bool ShowSonivoCredit { get; private set; } = true;
    public int Version { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    private GroupBranding()
    {
    }

    public static GroupBranding Create(Guid groupId, DateTimeOffset now)
    {
        if (groupId == Guid.Empty)
        {
            throw new ArgumentException("GroupId is required.", nameof(groupId));
        }

        return new GroupBranding
        {
            GroupId = groupId,
            ShowSonivoCredit = true,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1
        };
    }

    public void Update(
        string? displayName,
        string? accentHex,
        string? secondaryHex,
        string? accentColorHex,
        string? successHex,
        string? warningHex,
        string? errorHex,
        string? typography,
        string? coverKind,
        string? coverValue,
        string? themeDefault,
        string? defaultLocale,
        string? welcomeText,
        string? loginHeadline,
        string? tagline,
        string? verse,
        bool showSonivoCredit,
        DateTimeOffset now)
    {
        DisplayName = CleanOptional(displayName, MaxDisplayNameLength, nameof(displayName));
        AccentHex = NormalizeAccent(accentHex);
        SecondaryHex = NormalizeSecondary(secondaryHex);
        AccentColorHex = NormalizeAccentColor(accentColorHex);
        SuccessHex = NormalizeSemanticColor(successHex, nameof(successHex));
        WarningHex = NormalizeSemanticColor(warningHex, nameof(warningHex));
        ErrorHex = NormalizeSemanticColor(errorHex, nameof(errorHex));
        Typography = CleanEnum(typography, Typographies, nameof(typography));
        CoverKind = CleanEnum(coverKind, CoverKinds, nameof(coverKind));
        CoverValue = CleanOptional(coverValue, MaxCoverValueLength, nameof(coverValue));
        ThemeDefault = CleanEnum(themeDefault, Themes, nameof(themeDefault));
        DefaultLocale = CleanEnum(defaultLocale, Locales, nameof(defaultLocale));
        WelcomeText = CleanOptional(welcomeText, MaxTextLength, nameof(welcomeText));
        LoginHeadline = CleanOptional(loginHeadline, MaxTextLength, nameof(loginHeadline));
        Tagline = CleanOptional(tagline, MaxTaglineLength, nameof(tagline));
        Verse = CleanOptional(verse, MaxVerseLength, nameof(verse));

        if (CoverKind is null)
        {
            CoverValue = null;
        }

        ShowSonivoCredit = showSonivoCredit;
        Touch(now);
    }

    public void SetLogo(string blobKey, string contentType, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(blobKey))
        {
            throw new ArgumentException("Blob key is required.", nameof(blobKey));
        }

        LogoBlobKey = blobKey;
        LogoContentType = contentType;
        Touch(now);
    }

    public void RemoveLogo(DateTimeOffset now)
    {
        LogoBlobKey = null;
        LogoContentType = null;
        Touch(now);
    }

    public void SetBanner(string blobKey, string contentType, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(blobKey))
        {
            throw new ArgumentException("Blob key is required.", nameof(blobKey));
        }

        BannerBlobKey = blobKey;
        BannerContentType = contentType;
        Touch(now);
    }

    public void RemoveBanner(DateTimeOffset now)
    {
        BannerBlobKey = null;
        BannerContentType = null;
        Touch(now);
    }

    public void SetFavicon(string blobKey, string contentType, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(blobKey))
        {
            throw new ArgumentException("Blob key is required.", nameof(blobKey));
        }

        FaviconBlobKey = blobKey;
        FaviconContentType = contentType;
        Touch(now);
    }

    public void RemoveFavicon(DateTimeOffset now)
    {
        FaviconBlobKey = null;
        FaviconContentType = null;
        Touch(now);
    }

    private void Touch(DateTimeOffset now)
    {
        UpdatedAt = now;
        Version += 1;
    }

    private static string? NormalizeAccent(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (!BrandAccent.IsValidHex(value))
        {
            throw new ArgumentException("Accent must be a 6-digit hex colour.", nameof(value));
        }

        var normalized = BrandAccent.Normalize(value);
        if (!BrandAccent.MeetsAa(normalized))
        {
            throw new ArgumentException("Accent does not meet WCAG AA contrast.", nameof(value));
        }

        return normalized;
    }

    private static string? NormalizeSecondary(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (!BrandAccent.IsValidHex(value))
        {
            throw new ArgumentException("Secondary must be a 6-digit hex colour.", nameof(value));
        }

        var normalized = BrandAccent.Normalize(value);
        if (!BrandAccent.MeetsAaWithAnyInk(normalized))
        {
            throw new ArgumentException("Secondary does not meet WCAG AA contrast.", nameof(value));
        }

        return normalized;
    }

    /// <summary>
    /// The accent colour is used for badges, highlights and soft fills. It must
    /// meet AA with either white or near-black ink so text on top stays readable.
    /// </summary>
    private static string? NormalizeAccentColor(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (!BrandAccent.IsValidHex(value))
        {
            throw new ArgumentException("Accent colour must be a 6-digit hex colour.", nameof(value));
        }

        var normalized = BrandAccent.Normalize(value);
        if (!BrandAccent.MeetsAaWithAnyInk(normalized))
        {
            throw new ArgumentException("Accent colour does not meet WCAG AA contrast.", nameof(value));
        }

        return normalized;
    }

    /// <summary>
    /// Semantic colours (success/warning/error) are used for status badges and
    /// indicators. They must meet AA with either white or near-black ink.
    /// </summary>
    private static string? NormalizeSemanticColor(string? value, string parameter)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (!BrandAccent.IsValidHex(value))
        {
            throw new ArgumentException($"{parameter} must be a 6-digit hex colour.", nameof(value));
        }

        var normalized = BrandAccent.Normalize(value);
        if (!BrandAccent.MeetsAaWithAnyInk(normalized))
        {
            throw new ArgumentException($"{parameter} does not meet WCAG AA contrast.", nameof(value));
        }

        return normalized;
    }

    private static string? CleanOptional(string? value, int maxLength, string parameter)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            throw new ArgumentException($"Value must be {maxLength} characters or fewer.", parameter);
        }

        if (trimmed.Any(char.IsControl))
        {
            throw new ArgumentException("Value must not contain control characters.", parameter);
        }

        return trimmed;
    }

    private static string? CleanEnum(string? value, string[] allowed, string parameter)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim().ToLowerInvariant();
        if (!allowed.Contains(trimmed))
        {
            throw new ArgumentException($"Value must be one of: {string.Join(", ", allowed)}.", parameter);
        }

        return trimmed;
    }
}
