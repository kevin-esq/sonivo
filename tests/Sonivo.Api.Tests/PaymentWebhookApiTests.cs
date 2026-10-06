using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sonivo.Api.Tests;

/// <summary>
/// ADR-0073 §9.13: the provider webhook is anonymous but authenticated by an HMAC
/// signature (and exempted from CSRF only for this path). These tests prove the
/// signature gate, the manual 404, and idempotent replay handling.
/// </summary>
public sealed class PaymentWebhookApiTests : IClassFixture<SonivoApiFactory>
{
    private const string Secret = "test-webhook-secret";
    private readonly SonivoApiFactory _factory;

    public PaymentWebhookApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    private HttpClient SandboxClient() =>
        _factory
            .WithWebHostBuilder(builder =>
            {
                builder.UseSetting("Payments:Provider", "sandbox");
                builder.UseSetting("Payments:WebhookSecret", Secret);
            })
            .CreateClient();

    private static string Sign(string payload)
    {
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), Encoding.UTF8.GetBytes(payload));
        return "sha256=" + Convert.ToHexStringLower(mac);
    }

    private static HttpRequestMessage SignedRequest(string payload) =>
        new(HttpMethod.Post, "/api/payments/webhook")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            Headers = { { "X-Sonivo-Signature", Sign(payload) } }
        };

    [Fact]
    public async Task Manual_provider_serves_no_webhook_route()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync(
            "/api/payments/webhook",
            new StringContent("{}", Encoding.UTF8, "application/json"));

        // Manual means there is no gateway: the route does not exist (also proves
        // the CSRF exemption reaches the endpoint rather than being rejected).
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Sandbox_rejects_an_unsigned_webhook()
    {
        var client = SandboxClient();

        var response = await client.PostAsync(
            "/api/payments/webhook",
            new StringContent("""{"eventId":"e","type":"t"}""", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Sandbox_accepts_a_signed_webhook_and_deduplicates_replays()
    {
        var client = SandboxClient();
        const string payload = """{"eventId":"evt_api_1","type":"subscription.updated","status":"active"}""";

        var first = await client.SendAsync(SignedRequest(payload));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var firstBody = await first.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(firstBody.GetProperty("received").GetBoolean());
        Assert.False(firstBody.GetProperty("duplicate").GetBoolean());

        var replay = await client.SendAsync(SignedRequest(payload));
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        var replayBody = await replay.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(replayBody.GetProperty("duplicate").GetBoolean());
    }
}
