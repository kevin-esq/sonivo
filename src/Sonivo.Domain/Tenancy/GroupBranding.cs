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
    public const int MaxCoverValueLength = 32;

    private static readonly string[] CoverKinds = ["emoji", "gradient"];
    private static readonly string[] Themes = ["light", "dark", "system"];
    private static readonly string[] Locales = ["es", "en"];

    public Guid GroupId { get; private set; }
    public string? DisplayName { get; private set; }
    public string? AccentHex { get; private set; }
    public string? SecondaryHex { get; private set; }
    public string? CoverKind { get; private set; }
    public string? CoverValue { get; private set; }
    public string? ThemeDefault { get; private set; }
    public string? DefaultLocale { get; private set; }
    public string? WelcomeText { get; private set; }
    public string? LoginHeadline { get; private set; }
    public string? LogoBlobKey { get; private set; }
    public string? LogoContentType { get; private set; }
    public string? BannerBlobKey { get; private set; }
    public string? BannerContentType { get; private set; }
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
        string? coverKind,
        string? coverValue,
        string? themeDefault,
        string? defaultLocale,
        string? welcomeText,
        string? loginHeadline,
        bool showSonivoCredit,
        DateTimeOffset now)
    {
        DisplayName = CleanOptional(displayName, MaxDisplayNameLength, nameof(displayName));
        AccentHex = NormalizeAccent(accentHex);
        SecondaryHex = NormalizeSecondary(secondaryHex);
        CoverKind = CleanEnum(coverKind, CoverKinds, nameof(coverKind));
        CoverValue = CleanOptional(coverValue, MaxCoverValueLength, nameof(coverValue));
        ThemeDefault = CleanEnum(themeDefault, Themes, nameof(themeDefault));
        DefaultLocale = CleanEnum(defaultLocale, Locales, nameof(defaultLocale));
        WelcomeText = CleanOptional(welcomeText, MaxTextLength, nameof(welcomeText));
        LoginHeadline = CleanOptional(loginHeadline, MaxTextLength, nameof(loginHeadline));

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
