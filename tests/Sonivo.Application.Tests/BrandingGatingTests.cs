using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Billing;

namespace Sonivo.Application.Tests;

public class BrandingGatingTests
{
    private static UpdateGroupBrandingCommand Command(
        string? accent = null,
        string? secondary = null,
        string? typography = null,
        string? coverKind = null,
        string? coverValue = null,
        string? displayName = null,
        string? tagline = null,
        string? verse = null,
        string? welcomeText = null,
        string? loginHeadline = null,
        bool showSonivoCredit = true) =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            0,
            displayName,
            accent,
            secondary,
            null,
            null,
            null,
            null,
            typography,
            coverKind,
            coverValue,
            null,
            null,
            welcomeText,
            loginHeadline,
            tagline,
            verse,
            showSonivoCredit);

    [Fact]
    public void None_plan_rejects_colours_and_brand_text_but_allows_system_font()
    {
        var none = BrandingCapabilities.None;

        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(none, Command(accent: "#047857")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(none, Command(displayName: "X")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(none, Command(tagline: "t")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(none, Command(welcomeText: "w")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(none, Command(loginHeadline: "l")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(none, Command(coverKind: "emoji", coverValue: "🎵")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(none, Command(showSonivoCredit: false)));

        // The default font id is always allowed (it is the plan's own theme).
        BrandingGating.EnsureAllowed(none, Command(typography: "system"));
    }

    [Fact]
    public void Basic_plan_allows_one_accent_but_not_split_colours_font_or_brand_name()
    {
        var basic = BrandingCapabilities.Basic;

        BrandingGating.EnsureAllowed(basic, Command(accent: "#047857", coverKind: "emoji", coverValue: "🎵"));

        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(basic, Command(secondary: "#10b981")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(basic, Command(typography: "lora")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(basic, Command(displayName: "X")));
        Assert.Throws<ValidationException>(() => BrandingGating.EnsureAllowed(basic, Command(showSonivoCredit: false)));
    }

    [Fact]
    public void Advanced_plan_allows_every_field()
    {
        BrandingGating.EnsureAllowed(
            BrandingCapabilities.Advanced,
            Command(
                accent: "#047857",
                secondary: "#10b981",
                typography: "lora",
                coverKind: "emoji",
                coverValue: "🎵",
                displayName: "X",
                tagline: "t",
                verse: "v",
                welcomeText: "w",
                loginHeadline: "l",
                showSonivoCredit: false));
    }
}
