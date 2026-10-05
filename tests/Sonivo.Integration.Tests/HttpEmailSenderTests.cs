using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure;

namespace Sonivo.Integration.Tests;

public class HttpEmailSenderTests
{
    [Fact]
    public void IsConfigured_requires_endpoint_key_and_from()
    {
        var sender = CreateSender(new Dictionary<string, string?>());
        Assert.False(sender.IsConfigured);
    }

    [Fact]
    public void IsConfigured_true_when_all_values_present()
    {
        var sender = CreateSender(Configured());
        Assert.True(sender.IsConfigured);
    }

    [Fact]
    public async Task TrySendAsync_posts_json_with_bearer_key()
    {
        var handler = new StubHandler();
        var sender = CreateSender(Configured(), handler);

        var sent = await sender.TrySendAsync(
            new OutboundEmail("singer@example.com", "Join Band on Sonivo", "http://localhost/join/abc"),
            CancellationToken.None);

        Assert.True(sent);
        var request = Assert.Single(handler.Requests);
        Assert.Equal("https://api.example-email.com/emails", request.Uri);
        Assert.Equal("Bearer", request.Scheme);
        Assert.Equal("key-123", request.Parameter);
        Assert.Contains("owner@example.com", request.Body, StringComparison.Ordinal);
        Assert.Contains("singer@example.com", request.Body, StringComparison.Ordinal);
        Assert.Contains("Join Band on Sonivo", request.Body, StringComparison.Ordinal);
        Assert.Contains("http://localhost/join/abc", request.Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TrySendAsync_returns_false_when_transport_rejects()
    {
        var handler = new StubHandler { SendStatus = HttpStatusCode.Unauthorized };
        var sender = CreateSender(Configured(), handler);

        var sent = await sender.TrySendAsync(
            new OutboundEmail("singer@example.com", "Join Band on Sonivo", "link"),
            CancellationToken.None);

        Assert.False(sent);
    }

    [Fact]
    public void FromValidator_accepts_bare_address()
    {
        Assert.True(EmailFromValidator.IsValid("owner@example.com"));
    }

    [Fact]
    public void FromValidator_accepts_display_name_with_brackets_and_trims_whitespace()
    {
        Assert.True(EmailFromValidator.IsValid("  Sonivo <owner@example.com>  "));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-an-address")]
    [InlineData("owner@")]
    [InlineData("@example.com")]
    [InlineData("owner@example")]
    [InlineData("owner @example.com")]
    [InlineData("Sonivo <owner@example>")]
    [InlineData("Sonivo <not-an-address>")]
    [InlineData("Sonivo <owner@example.com")]
    public void FromValidator_rejects_malformed(string? from)
    {
        Assert.False(EmailFromValidator.IsValid(from));
    }

    [Fact]
    public void FromValidator_extracts_bare_address_from_display_form()
    {
        Assert.True(EmailFromValidator.TryExtractAddress("Sonivo <owner@example.com>", out var address));
        Assert.Equal("owner@example.com", address);
    }

    [Fact]
    public void PublicOrigin_trims_trailing_slash()
    {
        var origin = new ConfigurationPublicOrigin(
            new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["PublicOrigin"] = "https://sonivo.lat/"
                })
                .Build());

        Assert.Equal("https://sonivo.lat", origin.GetOrigin());
    }

    private static Dictionary<string, string?> Configured() => new()
    {
        ["Email:Endpoint"] = "https://api.example-email.com/emails",
        ["Email:ApiKey"] = "key-123",
        ["Email:From"] = "owner@example.com"
    };

    private static HttpEmailSender CreateSender(
        Dictionary<string, string?> values,
        HttpMessageHandler? handler = null)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var http = new HttpClient(handler ?? new StubHandler());
        return new HttpEmailSender(http, configuration, NullLogger<HttpEmailSender>.Instance);
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        public HttpStatusCode SendStatus { get; set; } = HttpStatusCode.OK;
        public List<(string Uri, string Body, string? Scheme, string? Parameter)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? ""
                : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((
                request.RequestUri?.ToString() ?? "",
                body,
                request.Headers.Authorization?.Scheme,
                request.Headers.Authorization?.Parameter));

            return new HttpResponseMessage(SendStatus)
            {
                Content = new StringContent("{}")
            };
        }
    }
}
