using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;

namespace Sonivo.Api.Tests.SessionHandoff;

/// <summary>
/// Endpoint-level verification of the ADR-0067 cross-subdomain handoff. The
/// service unit tests cover the ticket lifecycle; these prove the HTTP contract:
/// start is authenticated and membership-scoped, redeem is single-use, and the
/// redeemed cookie is host-only (never a parent-domain cookie).
/// </summary>
public class SessionHandoffApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public SessionHandoffApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Start_requires_authentication()
    {
        var client = NewClient();
        await EnsureCsrfAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/session/handoff/start", new { slug = "night-owls" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Start_blank_slug_returns_404()
    {
        var owner = await CreateAuthenticatedClientAsync(NewEmail("start-blank"));

        var response = await owner.PostAsJsonAsync(
            "/api/session/handoff/start", new { slug = "   " });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Start_unknown_slug_returns_404()
    {
        var owner = await CreateAuthenticatedClientAsync(NewEmail("start-unknown"));

        var response = await owner.PostAsJsonAsync(
            "/api/session/handoff/start", new { slug = "does-not-exist-xyz" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Start_non_member_returns_404()
    {
        var owner = await CreateAuthenticatedClientAsync(NewEmail("start-owner"));
        var group = await CreateGroupAsync(owner, "Start Handoff Band");

        var stranger = await CreateAuthenticatedClientAsync(NewEmail("start-stranger"));
        var response = await stranger.PostAsJsonAsync(
            "/api/session/handoff/start", new { slug = group.Slug });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Start_returns_a_tenant_host_redirect_with_a_code()
    {
        var owner = await CreateAuthenticatedClientAsync(NewEmail("start-ok"));
        var group = await CreateGroupAsync(owner, "Redirect Band");

        var response = await owner.PostAsJsonAsync(
            "/api/session/handoff/start", new { slug = group.Slug });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<HandoffStartResponse>(JsonOptions);
        Assert.NotNull(payload);

        var redirect = new Uri(payload.Redirect);
        // No PublicOrigin in tests, so the request host (localhost) is the apex.
        Assert.Equal($"{group.Slug}.localhost", redirect.Host);
        Assert.Equal("/session/handoff", redirect.AbsolutePath);
        Assert.False(string.IsNullOrWhiteSpace(CodeFrom(redirect)));
    }

    [Fact]
    public async Task Redeem_invalid_code_returns_400_problem_details()
    {
        var client = NewClient();
        await EnsureCsrfAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/session/handoff/redeem", new { code = "not-a-real-code" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Redeem_sets_a_host_only_session_cookie()
    {
        var owner = await CreateAuthenticatedClientAsync(NewEmail("redeem-ok"));
        var group = await CreateGroupAsync(owner, "Cookie Band");
        var code = await StartHandoffAsync(owner, group.Slug!);

        // A fresh client models the tenant host: no prior session there.
        var tenant = NewClient();
        await EnsureCsrfAsync(tenant);

        var response = await tenant.PostAsJsonAsync(
            "/api/session/handoff/redeem", new { code });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var setCookie = response.Headers.TryGetValues("Set-Cookie", out var values)
            ? string.Join("\n", values)
            : string.Empty;
        Assert.Contains("sonivo.auth=", setCookie); // Development cookie name
        Assert.DoesNotContain("Domain=", setCookie); // host-only: no parent-domain cookie

        // The redeemed session is usable on that host.
        var me = await tenant.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    [Fact]
    public async Task Redeem_is_single_use()
    {
        var owner = await CreateAuthenticatedClientAsync(NewEmail("redeem-replay"));
        var group = await CreateGroupAsync(owner, "Replay Band");
        var code = await StartHandoffAsync(owner, group.Slug!);

        var tenant = NewClient();
        await EnsureCsrfAsync(tenant);
        var first = await tenant.PostAsJsonAsync("/api/session/handoff/redeem", new { code });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        await EnsureCsrfAsync(tenant);
        var second = await tenant.PostAsJsonAsync("/api/session/handoff/redeem", new { code });
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    [Fact]
    public async Task Redeem_from_a_different_user_agent_is_rejected()
    {
        var owner = await CreateAuthenticatedClientAsync(NewEmail("redeem-ua"));
        owner.DefaultRequestHeaders.UserAgent.ParseAdd("SonivoTest/1.0 (start)");
        var group = await CreateGroupAsync(owner, "UA Band");
        var code = await StartHandoffAsync(owner, group.Slug!);

        var tenant = NewClient();
        tenant.DefaultRequestHeaders.UserAgent.ParseAdd("SonivoTest/2.0 (other)");
        await EnsureCsrfAsync(tenant);

        var response = await tenant.PostAsJsonAsync(
            "/api/session/handoff/redeem", new { code });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private HttpClient NewClient() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

    private static string NewEmail(string prefix) => $"{prefix}-{Guid.NewGuid():N}@example.com";

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password = "Password1")
    {
        var client = NewClient();
        await EnsureCsrfAsync(client);

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password,
            displayName = email
        });
        if (register.StatusCode is not (HttpStatusCode.Created or HttpStatusCode.Conflict))
        {
            var body = await register.Content.ReadAsStringAsync();
            throw new InvalidOperationException($"Register failed: {(int)register.StatusCode} {body}");
        }

        // T-AU-01: mailbox must be proven before the login gate passes.
        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password,
            rememberMe = false
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private static async Task<GroupResponse> CreateGroupAsync(HttpClient client, string name)
    {
        var create = await client.PostAsJsonAsync("/api/groups", new { name });
        create.EnsureSuccessStatusCode();
        var group = await create.Content.ReadFromJsonAsync<GroupResponse>(JsonOptions);
        return group ?? throw new InvalidOperationException("Missing group response");
    }

    private static async Task<string> StartHandoffAsync(HttpClient client, string slug)
    {
        var response = await client.PostAsJsonAsync(
            "/api/session/handoff/start", new { slug });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<HandoffStartResponse>(JsonOptions);
        var redirect = new Uri(payload?.Redirect ?? throw new InvalidOperationException("Missing redirect"));
        return CodeFrom(redirect);
    }

    private static string CodeFrom(Uri redirect)
    {
        var query = QueryHelpers.ParseQuery(redirect.Query);
        return query.TryGetValue("code", out var code) ? code.ToString() : string.Empty;
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<CsrfResponse>(JsonOptions);
        if (payload?.Token is null)
        {
            throw new InvalidOperationException("Missing CSRF token");
        }

        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload.Token);
    }

    private sealed record CsrfResponse(string Token);
    private sealed record GroupResponse(Guid Id, string Name, string? Slug, int Version, string? Role);
    private sealed record HandoffStartResponse(string Redirect);
}
