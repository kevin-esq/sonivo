using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sonivo.Api.Tests;

public class ProfileApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public ProfileApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_patch_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.PatchAsJsonAsync("/api/auth/me", new { displayName = "Nobody" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Authenticated_patch_updates_display_name()
    {
        var client = await CreateAuthenticatedClientAsync("profile-edit@example.com");

        var patch = await client.PatchAsJsonAsync("/api/auth/me", new { displayName = "  Kevin Esquivel  " });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var updated = await patch.Content.ReadFromJsonAsync<MeResponse>(JsonOptions);
        Assert.NotNull(updated);
        Assert.Equal("Kevin Esquivel", updated.DisplayName);

        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me", JsonOptions);
        Assert.NotNull(me);
        Assert.Equal("Kevin Esquivel", me.DisplayName);
    }

    [Fact]
    public async Task Blank_or_too_long_display_name_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("profile-bad@example.com");

        var blank = await client.PatchAsJsonAsync("/api/auth/me", new { displayName = "   " });
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);

        var tooLong = await client.PatchAsJsonAsync("/api/auth/me", new { displayName = new string('a', 201) });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password = "Password1")
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
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
    private sealed record MeResponse(Guid Id, string? Email, string? DisplayName, bool EmailConfirmed);
}
