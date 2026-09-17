using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure;

namespace Sonivo.Integration.Tests;

public class GmailEmailSenderTests
{
    [Fact]
    public void IsConfigured_requires_oauth_and_from()
    {
        var sender = CreateSender(new Dictionary<string, string?>());
        Assert.False(sender.IsConfigured);
    }

    [Fact]
    public async Task TrySendAsync_refreshes_token_then_posts_rfc2822()
    {
        var handler = new StubHandler();
        var sender = CreateSender(
            new Dictionary<string, string?>
            {
                ["Gmail:ClientId"] = "client",
                ["Gmail:ClientSecret"] = "secret",
                ["Gmail:RefreshToken"] = "refresh",
                ["Gmail:From"] = "owner@gmail.com"
            },
            handler);

        var sent = await sender.TrySendAsync(
            new OutboundEmail("singer@example.com", "Join Band on Sonivo", "http://localhost/join/abc"),
            CancellationToken.None);

        Assert.True(sent);
        Assert.Equal(2, handler.Requests.Count);
        Assert.Contains("oauth2.googleapis.com/token", handler.Requests[0].Uri, StringComparison.Ordinal);
        Assert.Contains("refresh", handler.Requests[0].Body, StringComparison.Ordinal);
        Assert.Contains("gmail.googleapis.com/gmail/v1/users/me/messages/send", handler.Requests[1].Uri, StringComparison.Ordinal);
        Assert.Equal("Bearer", handler.Requests[1].Scheme);
        Assert.Equal("ya29.test", handler.Requests[1].Parameter);
        Assert.Contains("raw", handler.Requests[1].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TrySendAsync_returns_false_when_gmail_rejects()
    {
        var handler = new StubHandler { SendStatus = HttpStatusCode.Unauthorized };
        var sender = CreateSender(
            new Dictionary<string, string?>
            {
                ["Gmail:ClientId"] = "client",
                ["Gmail:ClientSecret"] = "secret",
                ["Gmail:RefreshToken"] = "refresh",
                ["Gmail:From"] = "owner@gmail.com"
            },
            handler);

        var sent = await sender.TrySendAsync(
            new OutboundEmail("singer@example.com", "Join Band on Sonivo", "link"),
            CancellationToken.None);

        Assert.False(sent);
    }

    [Fact]
    public void PublicOrigin_trims_trailing_slash()
    {
        var origin = new ConfigurationPublicOrigin(
            new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["PublicOrigin"] = "https://sonivo.onrender.com/"
                })
                .Build());

        Assert.Equal("https://sonivo.onrender.com", origin.GetOrigin());
    }

    private static GmailEmailSender CreateSender(
        Dictionary<string, string?> values,
        HttpMessageHandler? handler = null)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var http = new HttpClient(handler ?? new StubHandler());
        return new GmailEmailSender(http, configuration, NullLogger<GmailEmailSender>.Instance);
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

            if (request.RequestUri?.Host == "oauth2.googleapis.com")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("""{"access_token":"ya29.test","expires_in":3600}""")
                };
            }

            return new HttpResponseMessage(SendStatus)
            {
                Content = new StringContent("{}")
            };
        }
    }
}
