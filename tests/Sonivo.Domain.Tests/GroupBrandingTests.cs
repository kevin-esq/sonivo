using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class GroupBrandingTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-01T12:00:00Z");

    [Theory]
    [InlineData("#5b4bd6", true)]
    [InlineData("#ffffff", false)] // white on white: no contrast
    [InlineData("#000000", true)]
    [InlineData("#7a7a7a", false)]  // ~4.29:1 against white: below AA
    [InlineData("#fff", false)]
    [InlineData("red", false)]
    [InlineData("5b4bd6", false)]
    [InlineData("#GGGGGG", false)]
    public void Accent_is_validated_and_meets_aa(string hex, bool expected)
    {
        var valid = BrandAccent.IsValidHex(hex);
        Assert.Equal(expected, valid && BrandAccent.MeetsAa(hex));
    }

    [Theory]
    [InlineData("#0f172a", true)]  // dark: only white text reaches AA
    [InlineData("#f5c542", true)]  // light: only near-black ink reaches AA
    [InlineData("#7a7a7a", false)] // neither white nor ink reaches AA
    public void Secondary_meets_aa_with_any_ink(string hex, bool expected)
    {
        var valid = BrandAccent.IsValidHex(hex);
        Assert.Equal(expected, valid && BrandAccent.MeetsAaWithAnyInk(hex));
    }

    [Fact]
    public void On_color_picks_the_higher_contrast_ink()
    {
        Assert.Equal(BrandAccent.White, BrandAccent.OnColor("#0f172a"));
        Assert.Equal(BrandAccent.DarkInk, BrandAccent.OnColor("#f5c542"));
    }

    [Fact]
    public void Update_normalizes_accent_and_stores_text()
    {
        var branding = GroupBranding.Create(Guid.NewGuid(), Now);

        branding.Update("Mi Banda", "#5B4BD6", "#F5C542", "gradient", "violeta", "dark", "es", "Bienvenido", "Entra", "Adorando juntos", "Salmo 150:6", false, Now.AddMinutes(1));

        Assert.Equal("#5b4bd6", branding.AccentHex);
        Assert.Equal("#f5c542", branding.SecondaryHex);
        Assert.Equal("Mi Banda", branding.DisplayName);
        Assert.Equal("gradient", branding.CoverKind);
        Assert.Equal("dark", branding.ThemeDefault);
        Assert.Equal("Adorando juntos", branding.Tagline);
        Assert.Equal("Salmo 150:6", branding.Verse);
        Assert.False(branding.ShowSonivoCredit);
        Assert.Equal(2, branding.Version);
    }

    [Fact]
    public void Update_rejects_invalid_colour_and_control_characters()
    {
        var branding = GroupBranding.Create(Guid.NewGuid(), Now);

        Assert.Throws<ArgumentException>(() =>
            branding.Update(null, "#7a7a7a", null, null, null, null, null, null, null, null, null, true, Now));
        Assert.Throws<ArgumentException>(() =>
            branding.Update(null, "javascript:alert(1)", null, null, null, null, null, null, null, null, null, true, Now));
        Assert.Throws<ArgumentException>(() =>
            branding.Update("bad\u0007name", null, null, null, null, null, null, null, null, null, null, true, Now));
    }

    [Fact]
    public void Update_rejects_low_contrast_secondary()
    {
        var branding = GroupBranding.Create(Guid.NewGuid(), Now);

        Assert.Throws<ArgumentException>(() =>
            branding.Update(null, null, "#7a7a7a", null, null, null, null, null, null, null, null, true, Now));
    }

    [Fact]
    public void Update_clears_cover_value_when_kind_is_removed()
    {
        var branding = GroupBranding.Create(Guid.NewGuid(), Now);

        branding.Update(null, null, null, "emoji", "🎸", null, null, null, null, null, null, true, Now);
        Assert.Equal("emoji", branding.CoverKind);

        branding.Update(null, null, null, null, null, null, null, null, null, null, null, true, Now.AddMinutes(1));
        Assert.Null(branding.CoverKind);
        Assert.Null(branding.CoverValue);
    }

    [Fact]
    public void Logo_can_be_set_and_removed()
    {
        var branding = GroupBranding.Create(Guid.NewGuid(), Now);

        branding.SetLogo("group-branding/x/logo-1", "image/png", Now.AddMinutes(1));
        Assert.Equal("image/png", branding.LogoContentType);

        branding.RemoveLogo(Now.AddMinutes(2));
        Assert.Null(branding.LogoBlobKey);
        Assert.Null(branding.LogoContentType);
    }

    [Fact]
    public void Banner_can_be_set_and_removed()
    {
        var branding = GroupBranding.Create(Guid.NewGuid(), Now);

        branding.SetBanner("group-branding/x/banner-1", "image/png", Now.AddMinutes(1));
        Assert.Equal("image/png", branding.BannerContentType);
        Assert.Equal("group-branding/x/banner-1", branding.BannerBlobKey);

        branding.RemoveBanner(Now.AddMinutes(2));
        Assert.Null(branding.BannerBlobKey);
        Assert.Null(branding.BannerContentType);
    }
}
