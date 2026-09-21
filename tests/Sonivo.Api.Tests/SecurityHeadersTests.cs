using System.Linq;
using System.Net;
using System.Threading.Tasks;

namespace Sonivo.Api.Tests;

public class SecurityHeadersTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public SecurityHeadersTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    // ADR-0037 T-FX-02: minimal YouTube nocookie embed policy. No other
    // directive loosened — assert the exact allowlisted hosts.
    [Fact]
    public async Task Responses_include_minimal_youtube_embed_csp()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.TryGetValues("Content-Security-Policy", out var values));
        var csp = values.Single();
        Assert.Contains("frame-src 'self' https://www.youtube-nocookie.com", csp);
        Assert.Contains("img-src 'self' data: https://i.ytimg.com", csp);
    }
}
