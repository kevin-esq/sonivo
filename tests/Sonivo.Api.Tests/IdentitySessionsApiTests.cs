using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sonivo.Api.Tests;

public sealed class IdentitySessionsApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public IdentitySessionsApiTests(SonivoApiFactory factory) => _factory = factory;

    [Fact]
    public async Task A_user_can_revoke_another_session_and_the_revoked_cookie_is_rejected()
    {
        var email = $"sessions-{Guid.NewGuid():N}@example.com";
        var first = await CreateAuthenticatedClientAsync(email);
        var second = await LoginAsync(email);

        var listed = await first.GetAsync("/api/auth/sessions");
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
        var sessions = await listed.Content.ReadFromJsonAsync<List<SessionDto>>(JsonOptions);
        Assert.NotNull(sessions);
        Assert.Equal(2, sessions.Count);
        var current = Assert.Single(sessions, session => session.IsCurrent);
        var other = Assert.Single(sessions, session => !session.IsCurrent);
        Assert.Matches("^[A-F0-9]{64}$", current.SessionKey);

        await EnsureCsrfAsync(first);
        var revoked = await first.PostAsync($"/api/auth/sessions/{other.SessionKey}/revoke", content: null);
        Assert.Equal(HttpStatusCode.NoContent, revoked.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/auth/me")).StatusCode);
        var remaining = await first.GetFromJsonAsync<List<SessionDto>>("/api/auth/sessions", JsonOptions);
        Assert.NotNull(remaining);
        Assert.Collection(remaining, session => Assert.Equal(current.SessionKey, session.SessionKey));
    }

    [Fact]
    public async Task A_user_cannot_revoke_another_users_session()
    {
        var first = await CreateAuthenticatedClientAsync($"sessions-owner-{Guid.NewGuid():N}@example.com");
        var other = await CreateAuthenticatedClientAsync($"sessions-other-{Guid.NewGuid():N}@example.com");
        var otherSessions = await other.GetFromJsonAsync<List<SessionDto>>("/api/auth/sessions", JsonOptions);
        Assert.NotNull(otherSessions);
        var otherSession = Assert.Single(otherSessions);

        await EnsureCsrfAsync(first);
        var response = await first.PostAsync($"/api/auth/sessions/{otherSession.SessionKey}/revoke", content: null);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await other.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Session_endpoints_require_authentication_and_csrf_for_revocation()
    {
        var anonymous = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/auth/sessions")).StatusCode);

        var client = await CreateAuthenticatedClientAsync($"sessions-csrf-{Guid.NewGuid():N}@example.com");
        var sessions = await client.GetFromJsonAsync<List<SessionDto>>("/api/auth/sessions", JsonOptions);
        Assert.NotNull(sessions);
        var session = Assert.Single(sessions);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        var response = await client.PostAsync($"/api/auth/sessions/{session.SessionKey}/revoke", content: null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Password_change_revokes_other_sessions_and_logout_removes_the_current_session()
    {
        var email = $"sessions-password-{Guid.NewGuid():N}@example.com";
        var current = await CreateAuthenticatedClientAsync(email);
        var other = await LoginAsync(email);

        await EnsureCsrfAsync(current);
        var changed = await current.PostAsJsonAsync("/api/auth/change-password", new
        {
            currentPassword = "Password1",
            newPassword = "Password2"
        });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await other.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await current.GetAsync("/api/auth/me")).StatusCode);

        var sessions = await current.GetFromJsonAsync<List<SessionDto>>("/api/auth/sessions", JsonOptions);
        Assert.NotNull(sessions);
        Assert.Single(sessions);

        await EnsureCsrfAsync(current);
        var logout = await current.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await current.GetAsync("/api/auth/me")).StatusCode);
    }

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
        return await LoginAsync(client, email);
    }

    private async Task<HttpClient> LoginAsync(string email) => await LoginAsync(CreateClient(), email);

    private static async Task<HttpClient> LoginAsync(HttpClient client, string email)
    {
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

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false,
        HandleCookies = true
    });

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<CsrfDto>(JsonOptions);
        Assert.False(string.IsNullOrWhiteSpace(payload?.Token));
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload!.Token);
    }

    private sealed record SessionDto(string SessionKey, bool IsCurrent, DateTimeOffset CreatedAt, DateTimeOffset LastSeenAt, DateTimeOffset ExpiresAt);
    private sealed record CsrfDto(string Token);
}
