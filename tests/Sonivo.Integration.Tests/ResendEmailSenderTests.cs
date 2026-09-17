using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Sonivo.Application.Abstractions;
using Sonivo.Infrastructure;

namespace Sonivo.Integration.Tests;

public class ResendEmailSenderTests
{
    [Fact]
    public void IsConfigured_requires_api_key_and_from()
    {
        var sender = CreateSender(new Dictionary<string, string?>());
        Assert.False(sender.IsConfigured);
    }

    [Fact]
    public async Task TrySendAsync_posts_to_resend_when_configured()
    {
        var handler = new StubHandler { Status = HttpStatusCode.OK };
        var sender = CreateSender(
            new Dictionary<string, string?>
            {
                ["Resend:ApiKey"] = "re_test",
                ["Resend:From"] = "Sonivo <noreply@example.com>"
            },
            handler);

        var sent = await sender.TrySendAsync(
            new OutboundEmail("singer@example.com", "Join Band on Sonivo", "http://localhost/join/abc"),
            CancellationToken.None);

        Assert.True(sent);
        Assert.NotNull(handler.Last);
        Assert.Equal(HttpMethod.Post, handler.Last!.Method);
        Assert.Contains("emails", handler.Last.RequestUri?.ToString(), StringComparison.Ordinal);
        Assert.Equal("Bearer", handler.Last.Headers.Authorization?.Scheme);
        Assert.Equal("re_test", handler.Last.Headers.Authorization?.Parameter);
        Assert.Contains("singer@example.com", handler.Body, StringComparison.Ordinal);
        Assert.Contains("Join Band on Sonivo", handler.Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TrySendAsync_returns_false_when_resend_rejects()
    {
        var handler = new StubHandler { Status = HttpStatusCode.Unauthorized };
        var sender = CreateSender(
            new Dictionary<string, string?>
            {
                ["Resend:ApiKey"] = "re_test",
                ["Resend:From"] = "Sonivo <noreply@example.com>"
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

    private static ResendEmailSender CreateSender(
        Dictionary<string, string?> values,
        HttpMessageHandler? handler = null)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var http = new HttpClient(handler ?? new StubHandler())
        {
            BaseAddress = new Uri("https://api.resend.com/")
        };
        return new ResendEmailSender(http, configuration, NullLogger<ResendEmailSender>.Instance);
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        public HttpRequestMessage? Last { get; private set; }
        public string Body { get; private set; } = "";

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Last = request;
            if (request.Content is not null)
            {
                Body = await request.Content.ReadAsStringAsync(cancellationToken);
            }

            return new HttpResponseMessage(Status)
            {
                Content = new StringContent("{}")
            };
        }
    }
}
