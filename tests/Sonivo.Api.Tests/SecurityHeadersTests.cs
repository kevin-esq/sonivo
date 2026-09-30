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

    // ADR-0037 T-FX-02 + L2 (SECURITY-AUDIT-2026-09): defense-in-depth CSP.
    // Keep the YouTube nocookie embed + thumbnail allowlist assertions; add
    // the hardened directives added in the L2 remediation.
    [Fact]
    public async Task Responses_include_minimal_youtube_embed_csp()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.TryGetValues("Content-Security-Policy", out var values));
        var csp = values.Single();
        Assert.Contains("default-src 'self'", csp);
        Assert.Contains("script-src 'self'", csp);
        Assert.Contains("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", csp);
        Assert.Contains("font-src 'self' https://fonts.gstatic.com", csp);
        Assert.Contains("frame-src 'self' https://www.youtube-nocookie.com", csp);
        Assert.Contains("img-src 'self' data: https://i.ytimg.com", csp);
        Assert.Contains("connect-src 'self'", csp);
        Assert.Contains("frame-ancestors 'none'", csp);
        Assert.Contains("base-uri 'self'", csp);
        Assert.Contains("form-action 'self'", csp);
        Assert.Contains("object-src 'none'", csp);
    }
}
