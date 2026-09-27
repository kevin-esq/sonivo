using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Sonivo.Api.Auth;

namespace Sonivo.Api.Tests;

/// <summary>
/// T-AU-03 Passkeys / WebAuthn API matrix tests (ADR-0038 S3):
/// Challenge generation, registration start/finish, listing registered passkeys,
/// deletion, and passkey login start/finish.
/// </summary>
public class PasskeysApiTests : IClassFixture<GoogleAuthApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly GoogleAuthApiFactory _factory;

    public PasskeysApiTests(GoogleAuthApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var csrfRes = await client.GetAsync("/api/auth/csrf");
        var csrfObj = await csrfRes.Content.ReadFromJsonAsync<JsonElement>();
        var token = csrfObj.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private async Task<HttpClient> CreateAuthedClientAsync(string email)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        await EnsureCsrfAsync(client);

        var regRes = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1",
            displayName = "Test User"
        });
        Assert.Equal(HttpStatusCode.Created, regRes.StatusCode);

        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);

        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.OK, loginRes.StatusCode);

        return client;
    }

    [Fact]
    public async Task Passkeys_registration_flow_and_listing_and_deletion_and_login()
    {
        var email = $"passkey-flow-{Guid.NewGuid():N}@example.com";
        var client = await CreateAuthedClientAsync(email);

        // 1. List initially empty
        var listRes1 = await client.GetAsync("/api/auth/passkeys");
        Assert.Equal(HttpStatusCode.OK, listRes1.StatusCode);
        var list1 = await listRes1.Content.ReadFromJsonAsync<List<PasskeyDto>>(JsonOptions);
        Assert.NotNull(list1);
        Assert.Empty(list1);

        // 2. Register start
        await EnsureCsrfAsync(client);
        var regStartRes = await client.PostAsJsonAsync("/api/auth/passkeys/register-start", new { });
        Assert.Equal(HttpStatusCode.OK, regStartRes.StatusCode);
        var regStart = await regStartRes.Content.ReadFromJsonAsync<PasskeyRegistrationStartResponse>(JsonOptions);
        Assert.NotNull(regStart);
        Assert.False(string.IsNullOrWhiteSpace(regStart.Challenge));
        Assert.Equal("Sonivo", regStart.RpName);

        // 3. Register finish
        var credId = $"pk-cred-{Guid.NewGuid():N}";
        await EnsureCsrfAsync(client);
        var regFinishRes = await client.PostAsJsonAsync("/api/auth/passkeys/register-finish", new
        {
            credentialId = credId,
            publicKey = "mock-public-key-bytes",
            deviceName = "Mi MacBook Pro"
        });
        Assert.Equal(HttpStatusCode.OK, regFinishRes.StatusCode);

        // 4. List now contains the new passkey
        var listRes2 = await client.GetAsync("/api/auth/passkeys");
        Assert.Equal(HttpStatusCode.OK, listRes2.StatusCode);
        var list2 = await listRes2.Content.ReadFromJsonAsync<List<PasskeyDto>>(JsonOptions);
        Assert.NotNull(list2);
        Assert.Single(list2);
        Assert.Equal(credId, list2[0].Id);
        Assert.Equal("Mi MacBook Pro", list2[0].Name);

        // 5. Unauthenticated passkey login flow
        var unauthedClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(unauthedClient);

        var loginStartRes = await unauthedClient.PostAsJsonAsync("/api/auth/passkeys/login-start", new { });
        Assert.Equal(HttpStatusCode.OK, loginStartRes.StatusCode);
        var loginStart = await loginStartRes.Content.ReadFromJsonAsync<PasskeyLoginStartResponse>(JsonOptions);
        Assert.NotNull(loginStart);
        Assert.False(string.IsNullOrWhiteSpace(loginStart.Challenge));

        await EnsureCsrfAsync(unauthedClient);
        var loginFinishRes = await unauthedClient.PostAsJsonAsync("/api/auth/passkeys/login-finish", new
        {
            credentialId = credId,
            signature = "mock-signature"
        });
        Assert.Equal(HttpStatusCode.OK, loginFinishRes.StatusCode);

        // Verify session works for unauthed client
        var meRes = await unauthedClient.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, meRes.StatusCode);

        // 6. Delete passkey
        await EnsureCsrfAsync(client);
        var delRes = await client.DeleteAsync($"/api/auth/passkeys/{credId}");
        Assert.Equal(HttpStatusCode.OK, delRes.StatusCode);

        var listRes3 = await client.GetAsync("/api/auth/passkeys");
        var list3 = await listRes3.Content.ReadFromJsonAsync<List<PasskeyDto>>(JsonOptions);
        Assert.NotNull(list3);
        Assert.Empty(list3);
    }

    [Fact]
    public async Task Login_finish_with_unknown_credential_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);

        var res = await client.PostAsJsonAsync("/api/auth/passkeys/login-finish", new
        {
            credentialId = "non-existent-credential-id"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
