using Sonivo.Api.Auth;

namespace Sonivo.Api.Tests;

public class OAuthNextTests
{
    [Theory]
    [InlineData("/join/abc123")]
    [InlineData("/join/A-Za.z0_~-9")]
    public void Sanitize_allows_join_paths(string path)
    {
        Assert.Equal(path, OAuthNext.Sanitize(path));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("https://evil.example/join/x")]
    [InlineData("//evil.example/join/x")]
    [InlineData("/login")]
    [InlineData("/join/../admin")]
    [InlineData("/join/has space")]
    [InlineData("join/token")]
    public void Sanitize_rejects_unsafe_paths(string? path)
    {
        Assert.Null(OAuthNext.Sanitize(path));
    }
}
