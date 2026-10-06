using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class GroupSlugTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-01T12:00:00Z");

    [Theory]
    [InlineData("Night Owls", "night-owls")]
    [InlineData("  Rock & Roll!  ", "rock-roll")]
    [InlineData("Café Ñandú", "cafe-nandu")]
    [InlineData("A", "grupo")]
    [InlineData("admin", "admin-grupo")]
    [InlineData("Grupo de Prueba 2026", "grupo-de-prueba-2026")]
    public void Slugify_normalizes_names(string input, string expected)
    {
        Assert.Equal(expected, GroupSlug.Slugify(input));
    }

    [Theory]
    [InlineData("night-owls", true)]
    [InlineData("band-123", true)]
    [InlineData("grupo", true)]
    [InlineData("ab", false)]          // too short
    [InlineData("-abc", false)]        // leading hyphen
    [InlineData("abc-", false)]        // trailing hyphen
    [InlineData("a--b", false)]        // double hyphen
    [InlineData("a.b", false)]         // dots are not allowed
    [InlineData("Admin", false)]       // uppercase
    [InlineData("api", false)]         // reserved
    [InlineData("g", false)]           // reserved + too short
    public void IsValid_enforces_the_slug_rules(string slug, bool expected)
    {
        Assert.Equal(expected, GroupSlug.IsValid(slug));
    }

    // The host map (ADR-0067 / DEPLOYMENT.md) reserves these segments so a Group
    // can never shadow `sonivo.lat`, `app.sonivo.lat`, `api.sonivo.lat`, etc.
    [Theory]
    [InlineData("www")]
    [InlineData("app")]
    [InlineData("account")]
    [InlineData("api")]
    [InlineData("admin")]
    [InlineData("dashboard")]
    [InlineData("panel")]
    [InlineData("auth")]
    [InlineData("login")]
    [InlineData("signup")]
    [InlineData("billing")]
    [InlineData("status")]
    [InlineData("static")]
    [InlineData("cdn")]
    [InlineData("docs")]
    [InlineData("blog")]
    [InlineData("help")]
    [InlineData("support")]
    [InlineData("mail")]
    [InlineData("smtp")]
    [InlineData("staging")]
    [InlineData("dev")]
    [InlineData("test")]
    [InlineData("internal")]
    [InlineData("system")]
    public void Host_map_segments_are_reserved(string slug)
    {
        Assert.True(GroupSlug.IsReserved(slug));
        Assert.False(GroupSlug.IsValid(slug));
    }

    [Theory]
    [InlineData("staging", "staging-grupo")]
    [InlineData("Staging", "staging-grupo")]
    [InlineData("api", "api-grupo")]
    [InlineData("Dashboard", "dashboard-grupo")]
    public void Slugify_avoids_reserved_host_map_segments(string input, string expected)
    {
        Assert.Equal(expected, GroupSlug.Slugify(input));
    }

    [Fact]
    public void WithSuffix_stays_within_the_length_limit()
    {
        var baseSlug = new string('a', 40);

        var suffixed = GroupSlug.WithSuffix(baseSlug, 12);

        Assert.True(suffixed.Length <= GroupSlug.MaxLength);
        Assert.EndsWith("-12", suffixed);
    }

    [Fact]
    public void Create_sets_a_slug_and_keeps_it_on_rename()
    {
        var group = Group.Create("Night Owls", Now);

        Assert.Equal("night-owls", group.Slug);

        group.Rename("Renamed Band", expectedVersion: 1, Now.AddMinutes(1));

        Assert.Equal("night-owls", group.Slug);
    }

    [Fact]
    public void Create_rejects_an_invalid_explicit_slug()
    {
        Assert.Throws<ArgumentException>(() => Group.Create("Band", Now, slug: "api"));
    }

    [Fact]
    public void AssignSlug_is_set_once()
    {
        var group = Group.Create("Band", Now);
        var original = group.Slug;

        group.AssignSlug("other-slug");

        Assert.Equal(original, group.Slug);
    }
}
