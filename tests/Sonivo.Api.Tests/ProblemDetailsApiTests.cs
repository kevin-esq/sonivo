using System.Net;
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.TestHost;

namespace Sonivo.Api.Tests;

public sealed class ProblemDetailsApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public ProblemDetailsApiTests(SonivoApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Authentication_challenge_has_code_and_correlated_support_id()
    {
        using var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var response = await client.GetAsync("/api/auth/me");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        AssertProblemMetadata(response, body.RootElement, "unauthorized");
    }

    [Fact]
    public async Task Unknown_route_has_code_and_correlated_support_id()
    {
        using var client = await CreateAuthenticatedClientAsync();

        using var response = await client.GetAsync("/api/no-such-endpoint");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        AssertProblemMetadata(response, body.RootElement, "not_found");
    }

    [Fact]
    public async Task Production_api_fallback_adds_code_and_support_id_without_changing_detail()
    {
        using var factory = _factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/no-such-endpoint");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = body.RootElement;

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found.", root.GetProperty("detail").GetString());
        Assert.Equal("not_found", root.GetProperty("code").GetString());
        Assert.Equal(root.GetProperty("supportId").GetString(), response.Headers.GetValues("X-Support-Id").Single());
        Assert.Equal(root.GetProperty("traceId").GetString(), response.Headers.GetValues("X-Request-Id").Single());
    }

    [Fact]
    public async Task Error_log_contains_the_response_support_id_and_trace_id()
    {
        using var sink = new CapturingLoggerProvider();
        using var factory = _factory.WithWebHostBuilder(builder =>
            builder.ConfigureLogging(logging => logging.AddProvider(sink)));
        using var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var response = await client.GetAsync("/api/auth/me");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var supportId = body.RootElement.GetProperty("supportId").GetString();
        var traceId = body.RootElement.GetProperty("traceId").GetString();

        Assert.NotNull(supportId);
        Assert.NotNull(traceId);
        Assert.Contains(sink.Messages, message => message.Contains(supportId, StringComparison.Ordinal)
            && message.Contains(traceId, StringComparison.Ordinal));
    }

    [Fact]
    public async Task App_exceptions_return_safe_details_without_changing_status_or_code()
    {
        var cases = new (Exception Exception, int Status, string Code, string Title, string Detail)[]
        {
            (new Sonivo.Application.Abstractions.ValidationException("validation detail"), 400, "validation_failed", "Validation failed", "The request is invalid."),
            (new Sonivo.Application.Abstractions.ForbiddenException("forbidden detail"), 403, "forbidden", "Forbidden", "You are not allowed to perform this action."),
            (new Sonivo.Application.Abstractions.NotFoundException("not found detail"), 404, "not_found", "Not Found", "The requested resource was not found."),
            (new Sonivo.Application.Abstractions.ConflictException("conflict detail"), 409, "conflict", "Conflict", "The request conflicts with the current state."),
            (new Sonivo.Application.Abstractions.ConflictException("billing-active-plan-required"), 409, "billing_active_plan_required", "Conflict", "billing-active-plan-required"),
            (new Sonivo.Application.Abstractions.UploadLimitException(123), 413, "payload_too_large", "Content Too Large", "The request content exceeds the allowed size.")
        };

        foreach (var errorCase in cases)
        {
            using var stream = new MemoryStream();
            var context = new DefaultHttpContext
            {
                RequestServices = _factory.Services
            };
            context.TraceIdentifier = "test-trace-id";
            context.Request.Headers["Accept"] = "application/json";
            context.Response.Body = stream;

            var service = _factory.Services.GetRequiredService<IProblemDetailsService>();
            var handler = new AppExceptionHandler(service);
            Assert.True(await handler.TryHandleAsync(context, errorCase.Exception, CancellationToken.None));

            stream.Position = 0;
            using var body = await JsonDocument.ParseAsync(stream);
            var root = body.RootElement;
            Assert.Equal(errorCase.Status, context.Response.StatusCode);
            Assert.Equal(errorCase.Title, root.GetProperty("title").GetString());
            Assert.Equal(errorCase.Detail, root.GetProperty("detail").GetString());
            Assert.Equal(errorCase.Code, root.GetProperty("code").GetString());
            Assert.Equal(root.GetProperty("supportId").GetString(), context.Response.Headers["X-Support-Id"].ToString());
            Assert.Equal("test-trace-id", root.GetProperty("traceId").GetString());
        }
    }

    [Fact]
    public async Task Unexpected_problem_is_generic_and_has_internal_code()
    {
        using var stream = new MemoryStream();
        var context = new DefaultHttpContext
        {
            RequestServices = _factory.Services
        };
        context.TraceIdentifier = "test-trace-id";
        context.Request.Headers["Accept"] = "application/json";
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.Body = stream;

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An error occurred while processing your request."
        };
        var service = _factory.Services.GetRequiredService<IProblemDetailsService>();
        Assert.True(await service.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            Exception = new InvalidOperationException("private exception marker"),
            ProblemDetails = problem
        }));

        stream.Position = 0;
        using var body = await JsonDocument.ParseAsync(stream);
        var json = body.RootElement;
        Assert.Equal("internal_error", json.GetProperty("code").GetString());
        Assert.Equal("An unexpected error occurred.", json.GetProperty("detail").GetString());
        Assert.DoesNotContain("private exception marker", json.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(nameof(InvalidOperationException), json.ToString(), StringComparison.Ordinal);
        Assert.Equal("An error occurred while processing your request.", json.GetProperty("title").GetString());
        Assert.Equal(json.GetProperty("supportId").GetString(), context.Response.Headers["X-Support-Id"].ToString());
        Assert.Equal("test-trace-id", json.GetProperty("traceId").GetString());
    }

    [Fact]
    public async Task Unexpected_http_exception_returns_generic_problem_and_correlated_log()
    {
        using var sink = new CapturingLoggerProvider();
        using var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureLogging(logging => logging.AddProvider(sink));
            builder.ConfigureTestServices(services => services.AddTransient<IStartupFilter, ThrowingStartupFilter>());
        });
        using var client = await CreateAuthenticatedClientAsync(factory);

        using var response = await client.GetAsync("/__test/unexpected-error");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var json = body.RootElement;
        var supportId = json.GetProperty("supportId").GetString();
        var traceId = json.GetProperty("traceId").GetString();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("internal_error", json.GetProperty("code").GetString());
        Assert.Equal("An unexpected error occurred.", json.GetProperty("detail").GetString());
        Assert.DoesNotContain("unexpected private marker", json.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(nameof(InvalidOperationException), json.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(" at ", json.ToString(), StringComparison.Ordinal);
        Assert.NotNull(supportId);
        Assert.NotNull(traceId);
        Assert.Equal(supportId, response.Headers.GetValues("X-Support-Id").Single());
        Assert.Contains(sink.Messages, message => message.Contains(supportId, StringComparison.Ordinal)
            && message.Contains(traceId, StringComparison.Ordinal));
    }

    [Fact]
    public async Task App_exception_message_is_logged_but_not_returned()
    {
        const string userValue = "user-value-test-7f21";
        const string token = "token-test-7f21";
        const string route = "/private/test-route-7f21";
        var originalMessage = $"Invalid request for {userValue}; token={token}; route={route}";
        using var sink = new CapturingLoggerProvider();
        using var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureLogging(logging => logging.AddProvider(sink));
            builder.ConfigureTestServices(services => services.AddTransient<IStartupFilter, ThrowingStartupFilter>());
        });
        using var client = await CreateAuthenticatedClientAsync(factory);

        using var response = await client.GetAsync("/__test/app-error");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var json = body.RootElement;
        var supportId = json.GetProperty("supportId").GetString();
        var traceId = json.GetProperty("traceId").GetString();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", json.GetProperty("code").GetString());
        Assert.Equal("The request is invalid.", json.GetProperty("detail").GetString());
        foreach (var secret in new[] { userValue, token, route, originalMessage, nameof(Sonivo.Application.Abstractions.ValidationException) })
        {
            Assert.DoesNotContain(secret, json.ToString(), StringComparison.Ordinal);
        }
        Assert.NotNull(supportId);
        Assert.NotNull(traceId);
        Assert.Contains(sink.Messages, message => message.Contains(originalMessage, StringComparison.Ordinal)
            && message.Contains(supportId, StringComparison.Ordinal)
            && message.Contains(traceId, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Direct_problem_exception_message_is_logged_but_not_returned()
    {
        const string permission = "private-permission-test-9b31";
        using var sink = new CapturingLoggerProvider();
        using var factory = _factory.WithWebHostBuilder(builder =>
            builder.ConfigureLogging(logging => logging.AddProvider(sink)));
        using var client = await CreateAuthenticatedClientAsync(factory);

        using var groupResponse = await client.PostAsJsonAsync("/api/groups", new { name = "Safe Error Test Band" });
        Assert.Equal(HttpStatusCode.Created, groupResponse.StatusCode);
        using var groupBody = JsonDocument.Parse(await groupResponse.Content.ReadAsStringAsync());
        var groupId = groupBody.RootElement.GetProperty("id").GetGuid();

        await EnsureCsrfAsync(client);
        using var response = await client.PostAsJsonAsync($"/api/groups/{groupId}/roles", new
        {
            name = "Invalid Permission Role",
            permissions = new[] { permission }
        });
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var json = body.RootElement;
        var supportId = json.GetProperty("supportId").GetString();
        var traceId = json.GetProperty("traceId").GetString();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", json.GetProperty("code").GetString());
        Assert.Equal("The request is invalid.", json.GetProperty("detail").GetString());
        Assert.DoesNotContain(permission, json.ToString(), StringComparison.Ordinal);
        Assert.NotNull(supportId);
        Assert.NotNull(traceId);
        Assert.Equal(supportId, response.Headers.GetValues("X-Support-Id").Single());
        Assert.Contains(sink.Messages, message => message.Contains(permission, StringComparison.Ordinal)
            && message.Contains(supportId, StringComparison.Ordinal)
            && message.Contains(traceId, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Method_not_allowed_has_stable_code_and_safe_detail()
    {
        using var client = await CreateAuthenticatedClientAsync();

        using var response = await client.GetAsync("/api/auth/logout");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
        Assert.Equal("method_not_allowed", body.RootElement.GetProperty("code").GetString());
        Assert.Equal("The HTTP method is not allowed for this resource.", body.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertProblemMetadata(HttpResponseMessage response, JsonElement body, string expectedCode)
    {
        Assert.Equal(expectedCode, body.GetProperty("code").GetString());
        Assert.Equal(body.GetProperty("supportId").GetString(), response.Headers.GetValues("X-Support-Id").Single());
        Assert.Equal(body.GetProperty("traceId").GetString(), response.Headers.GetValues("X-Request-Id").Single());
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(WebApplicationFactory<Program>? factory = null)
    {
        factory ??= _factory;
        var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        var email = $"problem-details-{Guid.NewGuid():N}@example.com";
        await EnsureCsrfAsync(client);
        using var registration = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1",
            displayName = "Problem Details Test"
        });
        Assert.Equal(HttpStatusCode.Created, registration.StatusCode);
        await AuthTestHelper.ConfirmEmailAsync(factory.Services, email);
        await EnsureCsrfAsync(client);
        using var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1",
            rememberMe = false
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var token = body.RootElement.GetProperty("token").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _messages = new();

        internal IEnumerable<string> Messages => _messages;

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(_messages);

        public void Dispose() { }

        private sealed class CapturingLogger(ConcurrentQueue<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => messages.Enqueue($"{formatter(state, exception)} {exception}");
        }
    }

    private sealed class ThrowingStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            next(app);
            app.Use(async (context, nextMiddleware) =>
            {
                if (context.Request.Path == "/__test/unexpected-error")
                {
                    throw new InvalidOperationException("unexpected private marker");
                }

                if (context.Request.Path == "/__test/app-error")
                {
                    throw new Sonivo.Application.Abstractions.ValidationException(
                        "Invalid request for user-value-test-7f21; token=token-test-7f21; route=/private/test-route-7f21");
                }

                await nextMiddleware();
            });
        };
    }
}
