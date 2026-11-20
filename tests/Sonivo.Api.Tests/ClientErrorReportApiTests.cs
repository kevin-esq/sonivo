using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Sonivo.Api.Tests;

public sealed class ClientErrorReportApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public ClientErrorReportApiTests(SonivoApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Client_error_report_is_protected_redacted_normalized_and_bounded()
    {
        using var logs = new CapturingLoggerProvider();
        var loggerFactory = _factory.Services.GetRequiredService<ILoggerFactory>();
        loggerFactory.AddProvider(logs);

        var anonymous = CreateClient();
        await EnsureCsrfAsync(anonymous);
        var anonymousResponse = await anonymous.PostAsJsonAsync("/api/client-errors", new
        {
            source = "anonymous",
            message = "anonymous"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        var client = await CreateAuthenticatedClientAsync($"client-error-{Guid.NewGuid():N}@example.com");

        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        var missingCsrf = await client.PostAsJsonAsync("/api/client-errors", new
        {
            source = "csrf",
            message = "csrf"
        });
        Assert.Equal(HttpStatusCode.BadRequest, missingCsrf.StatusCode);

        await EnsureCsrfAsync(client);
        using var me = JsonDocument.Parse(await client.GetStringAsync("/api/auth/me"));
        var authenticatedUserId = me.RootElement.GetProperty("id").GetString();
        Assert.False(string.IsNullOrWhiteSpace(authenticatedUserId));

        const string urlSentinel = "https://private.example/page?access_token=URL_TOKEN_SENTINEL";
        const string stackSentinel = "STACK_TRACE_SENTINEL";
        const string payloadUserIdSentinel = "PAYLOAD_USER_ID_SENTINEL";
        const string emailSentinel = "private.user@example.test";
        const string bearerSentinel = "BEARER_TOKEN_SENTINEL";
        const string jwtSentinel = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature_payload_token";
        const string idSentinel = "2f3a1b4c-5d6e-7f80-9123-456789abcdef";
        const string hexSentinel = "0123456789abcdef0123456789abcdef";
        const string base64Sentinel = "YWJjZDEyMzQ1Njc4OWFiY2RlZjAxMjM0";
        var report = await client.PostAsJsonAsync("/api/client-errors", new
        {
            source = "window.error\r\nSOURCE_LINE_SENTINEL\t",
            message = $"MESSAGE_LINE_ONE\nMESSAGE_LINE_TWO\0 {urlSentinel}, {emailSentinel}; Bearer {bearerSentinel}; {jwtSentinel}; {idSentinel}; {hexSentinel}; {base64Sentinel}.",
            url = urlSentinel,
            stack = stackSentinel,
            userId = payloadUserIdSentinel
        });
        Assert.Equal(HttpStatusCode.Accepted, report.StatusCode);

        var reportLog = Assert.Single(logs.Messages);
        Assert.DoesNotContain(urlSentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain("URL_TOKEN_SENTINEL", reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(stackSentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(payloadUserIdSentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(emailSentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(bearerSentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(jwtSentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(idSentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(hexSentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(base64Sentinel, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain(authenticatedUserId!, reportLog, StringComparison.Ordinal);
        Assert.DoesNotContain('\r', reportLog);
        Assert.DoesNotContain('\n', reportLog);
        Assert.DoesNotContain('\t', reportLog);
        Assert.DoesNotContain('\0', reportLog);
        Assert.Contains("window.errorSOURCE_LINE_SENTINEL", reportLog, StringComparison.Ordinal);
        Assert.Contains("MESSAGE_LINE_ONEMESSAGE_LINE_TWO", reportLog, StringComparison.Ordinal);
        Assert.Contains("[url]", reportLog, StringComparison.Ordinal);
        Assert.Contains("[email]", reportLog, StringComparison.Ordinal);
        Assert.Contains("[token]", reportLog, StringComparison.Ordinal);
        Assert.Contains("[id]", reportLog, StringComparison.Ordinal);
        Assert.Equal(4, reportLog.Split("[token]", StringSplitOptions.None).Length - 1);

        logs.Clear();
        var bounded = await client.PostAsJsonAsync("/api/client-errors", new
        {
            source = new string('s', 80),
            message = new string('m', 600),
            url = "https://private.example/bounded?token=BOUND_URL_SENTINEL",
            stack = "BOUND_STACK_SENTINEL"
        });
        Assert.Equal(HttpStatusCode.Accepted, bounded.StatusCode);
        var boundedLog = Assert.Single(logs.Messages);
        Assert.Equal($"Client error [{new string('s', 60)}]: {new string('m', 500)}", boundedLog);

        var receivedRateLimit = false;
        for (var attempt = 0; attempt < 65; attempt++)
        {
            var response = await client.PostAsJsonAsync("/api/client-errors", new
            {
                source = "rate-limit",
                message = "rate-limit"
            });
            if (response.StatusCode == (HttpStatusCode)429)
            {
                receivedRateLimit = true;
                break;
            }

            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        }

        Assert.True(receivedRateLimit, "Expected the existing client-errors rate limit to reject a request.");
    }

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false,
        HandleCookies = true
    });

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email)
    {
        var client = CreateClient();
        await EnsureCsrfAsync(client);
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1",
            displayName = email
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);
        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);

        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1",
            rememberMe = false
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return client;
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<CsrfResponse>();
        Assert.False(string.IsNullOrWhiteSpace(payload?.Token));
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload!.Token);
    }

    private sealed record CsrfResponse(string Token);

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _messages = new();

        public IReadOnlyCollection<string> Messages => _messages.ToArray();

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(this, categoryName);

        public void Clear()
        {
            while (_messages.TryDequeue(out _))
            {
            }
        }

        public void Dispose()
        {
        }

        private void Capture(string categoryName, LogLevel logLevel, string message)
        {
            if (categoryName == "Sonivo.ClientError" && logLevel >= LogLevel.Warning)
            {
                _messages.Enqueue(message);
            }
        }

        private sealed class CapturingLogger(CapturingLoggerProvider provider, string categoryName) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Warning;

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                provider.Capture(categoryName, logLevel, formatter(state, exception));
            }
        }
    }
}
