using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Api.Auth;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Tests;

/// <summary>
/// T-AU-03 / T-SEC-01 Passkeys / WebAuthn API matrix tests (ADR-0038 S3 + C1).
/// Registration + login are driven through a deterministic in-process fake
/// authenticator (real ECDSA P-256 ceremony), so the server-side verifier is
/// exercised end-to-end: challenge consumption, origin allow-list, rpIdHash,
/// UP flag, sign-counter regression, and ES256 assertion signatures.
///
/// Each test builds a fresh factory so the per-IP passkey rate-limiter budgets
/// (challenge 10/min, manage 30/min) reset between tests.
/// </summary>
public class PasskeysApiTests
{
    private const string DevOrigin = "http://localhost:5173";

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var csrfRes = await client.GetAsync("/api/auth/csrf");
        var csrfObj = await csrfRes.Content.ReadFromJsonAsync<JsonElement>();
        var token = csrfObj.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private static HttpClient CreateAnonymousClient(GoogleAuthApiFactory factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

    private static async Task<HttpClient> CreateAuthedClientAsync(GoogleAuthApiFactory factory, string email)
    {
        var client = CreateAnonymousClient(factory);

        await EnsureCsrfAsync(client);

        var regRes = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1",
            displayName = "Test User"
        });
        Assert.Equal(HttpStatusCode.Created, regRes.StatusCode);

        await AuthTestHelper.ConfirmEmailAsync(factory.Services, email);

        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.OK, loginRes.StatusCode);

        return client;
    }

    private static async Task<(HttpClient Client, FakeAuthenticator Auth, string CredentialId)> RegisterPasskeyAsync(
        GoogleAuthApiFactory factory)
    {
        var email = $"passkey-{Guid.NewGuid():N}@example.com";
        var client = await CreateAuthedClientAsync(factory, email);
        var authenticator = new FakeAuthenticator();

        await EnsureCsrfAsync(client);
        var regStartRes = await client.PostAsJsonAsync("/api/auth/passkeys/register-start", new { });
        Assert.Equal(HttpStatusCode.OK, regStartRes.StatusCode);
        var regStart = await regStartRes.Content.ReadFromJsonAsync<PasskeyRegistrationStartResponse>(JsonOptions);
        Assert.NotNull(regStart);
        Assert.False(string.IsNullOrWhiteSpace(regStart.Challenge));

        var (clientData, attestationObject) = authenticator.BuildAttestation(
            regStart.RpId, regStart.Challenge, DevOrigin, signCount: 0);

        await EnsureCsrfAsync(client);
        var regFinishRes = await client.PostAsJsonAsync("/api/auth/passkeys/register-finish", new
        {
            clientData,
            attestationObject,
            deviceName = "Mi MacBook Pro"
        });
        Assert.Equal(HttpStatusCode.OK, regFinishRes.StatusCode);
        var regFinish = await regFinishRes.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal(authenticator.CredentialId, regFinish.GetProperty("credentialId").GetString());

        return (client, authenticator, authenticator.CredentialId);
    }

    private static async Task<(string Challenge, string RpId)> StartLoginAsync(HttpClient client)
    {
        await EnsureCsrfAsync(client);
        var res = await client.PostAsJsonAsync("/api/auth/passkeys/login-start", new { });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var start = await res.Content.ReadFromJsonAsync<PasskeyLoginStartResponse>(JsonOptions);
        Assert.NotNull(start);
        Assert.False(string.IsNullOrWhiteSpace(start.Challenge));
        return (start.Challenge, start.RpId);
    }

    private static async Task<HttpStatusCode> LoginFinishAsync(
        HttpClient client, string credentialId, FakeAuthenticator auth,
        string rpId, string challenge, string origin = DevOrigin, long signCount = 1)
    {
        var (clientData, authenticatorData, signature) = auth.BuildAssertion(rpId, challenge, origin, signCount);
        await EnsureCsrfAsync(client);
        var res = await client.PostAsJsonAsync("/api/auth/passkeys/login-finish", new
        {
            credentialId,
            clientData,
            authenticatorData,
            signature
        });
        return res.StatusCode;
    }

    [Fact]
    public async Task Passkeys_registration_flow_and_listing_and_login_and_deletion()
    {
        await using var factory = new GoogleAuthApiFactory();
        var email = $"passkey-flow-{Guid.NewGuid():N}@example.com";
        var client = await CreateAuthedClientAsync(factory, email);
        var authenticator = new FakeAuthenticator();

        // 1. List initially empty
        var listRes1 = await client.GetAsync("/api/auth/passkeys");
        Assert.Equal(HttpStatusCode.OK, listRes1.StatusCode);
        var list1 = await listRes1.Content.ReadFromJsonAsync<List<PasskeyDto>>(JsonOptions);
        Assert.NotNull(list1);
        Assert.Empty(list1);

        // 2. Register start (capture challenge + rpId)
        await EnsureCsrfAsync(client);
        var regStartRes = await client.PostAsJsonAsync("/api/auth/passkeys/register-start", new { });
        Assert.Equal(HttpStatusCode.OK, regStartRes.StatusCode);
        var regStart = await regStartRes.Content.ReadFromJsonAsync<PasskeyRegistrationStartResponse>(JsonOptions);
        Assert.NotNull(regStart);
        Assert.False(string.IsNullOrWhiteSpace(regStart.Challenge));
        Assert.Equal("Sonivo", regStart.RpName);

        // 3. Register finish with a real fake attestation
        var (clientData, attestationObject) = authenticator.BuildAttestation(
            regStart.RpId, regStart.Challenge, DevOrigin, signCount: 0);
        await EnsureCsrfAsync(client);
        var regFinishRes = await client.PostAsJsonAsync("/api/auth/passkeys/register-finish", new
        {
            clientData,
            attestationObject,
            deviceName = "Mi MacBook Pro"
        });
        Assert.Equal(HttpStatusCode.OK, regFinishRes.StatusCode);

        // 4. List now contains the new passkey (server-extracted credentialId)
        var credId = authenticator.CredentialId;
        var listRes2 = await client.GetAsync("/api/auth/passkeys");
        Assert.Equal(HttpStatusCode.OK, listRes2.StatusCode);
        var list2 = await listRes2.Content.ReadFromJsonAsync<List<PasskeyDto>>(JsonOptions);
        Assert.NotNull(list2);
        Assert.Single(list2);
        Assert.Equal(credId, list2[0].Id);
        Assert.Equal("Mi MacBook Pro", list2[0].Name);

        // 5. Unauthenticated passkey login flow
        var unauthedClient = CreateAnonymousClient(factory);
        var (challenge, rpId) = await StartLoginAsync(unauthedClient);

        var loginStatus = await LoginFinishAsync(unauthedClient, credId, authenticator, rpId, challenge, signCount: 1);
        Assert.Equal(HttpStatusCode.OK, loginStatus);

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
        await using var factory = new GoogleAuthApiFactory();
        var client = CreateAnonymousClient(factory);
        await EnsureCsrfAsync(client);

        var res = await client.PostAsJsonAsync("/api/auth/passkeys/login-finish", new
        {
            credentialId = "non-existent-credential-id"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Login_finish_with_signature_from_a_different_key_returns_401()
    {
        await using var factory = new GoogleAuthApiFactory();
        var (_, registeredAuth, credId) = await RegisterPasskeyAsync(factory);

        var client = CreateAnonymousClient(factory);
        var (challenge, rpId) = await StartLoginAsync(client);

        // A different authenticator (fresh keypair) signs the assertion, but the
        // request still claims the registered credentialId — the stored COSE key
        // must reject the foreign signature.
        var imposter = new FakeAuthenticator();
        var status = await LoginFinishAsync(client, credId, imposter, rpId, challenge, signCount: 1);

        Assert.Equal(HttpStatusCode.Unauthorized, status);
    }

    [Fact]
    public async Task Login_finish_with_replayed_challenge_returns_401()
    {
        await using var factory = new GoogleAuthApiFactory();
        var (_, auth, credId) = await RegisterPasskeyAsync(factory);

        var client = CreateAnonymousClient(factory);
        var (challenge, rpId) = await StartLoginAsync(client);

        // First login consumes the challenge.
        var first = await LoginFinishAsync(client, credId, auth, rpId, challenge, signCount: 1);
        Assert.Equal(HttpStatusCode.OK, first);

        // Reusing the same challenge must fail (single-use).
        var replayClient = CreateAnonymousClient(factory);
        var replay = await LoginFinishAsync(replayClient, credId, auth, rpId, challenge, signCount: 2);

        Assert.Equal(HttpStatusCode.Unauthorized, replay);
    }

    [Fact]
    public async Task Login_finish_with_counter_regression_returns_401()
    {
        await using var factory = new GoogleAuthApiFactory();
        var (_, auth, credId) = await RegisterPasskeyAsync(factory);

        var client = CreateAnonymousClient(factory);
        var (challenge1, rpId) = await StartLoginAsync(client);
        var first = await LoginFinishAsync(client, credId, auth, rpId, challenge1, signCount: 1);
        Assert.Equal(HttpStatusCode.OK, first);

        // A second assertion carrying a non-advancing signCount is a clone signal.
        var (challenge2, _) = await StartLoginAsync(client);
        var regression = await LoginFinishAsync(client, credId, auth, rpId, challenge2, signCount: 1);

        Assert.Equal(HttpStatusCode.Unauthorized, regression);
    }

    [Fact]
    public async Task Login_finish_with_foreign_origin_returns_401()
    {
        await using var factory = new GoogleAuthApiFactory();
        var (_, auth, credId) = await RegisterPasskeyAsync(factory);

        var client = CreateAnonymousClient(factory);
        var (challenge, rpId) = await StartLoginAsync(client);

        var status = await LoginFinishAsync(client, credId, auth, rpId, challenge, origin: "https://evil.example", signCount: 1);

        Assert.Equal(HttpStatusCode.Unauthorized, status);
    }

    [Fact]
    public async Task Login_finish_with_wrong_rp_id_hash_returns_401()
    {
        await using var factory = new GoogleAuthApiFactory();
        var (_, auth, credId) = await RegisterPasskeyAsync(factory);

        var client = CreateAnonymousClient(factory);
        var (challenge, rpId) = await StartLoginAsync(client);

        // The authenticatorData is built for a different relying party, so its
        // rpIdHash cannot match the server's effective rpId.
        var status = await LoginFinishAsync(client, credId, auth, rpId: "evil.example", challenge, signCount: 1);

        Assert.Equal(HttpStatusCode.Unauthorized, status);
    }

    [Fact]
    public async Task Login_finish_with_challenge_mismatch_returns_401()
    {
        await using var factory = new GoogleAuthApiFactory();
        var (_, auth, credId) = await RegisterPasskeyAsync(factory);

        var client = CreateAnonymousClient(factory);
        await StartLoginAsync(client);

        // clientData carries a challenge that was never issued.
        var status = await LoginFinishAsync(client, credId, auth, "localhost", challenge: "never-issued-challenge", signCount: 1);

        Assert.Equal(HttpStatusCode.Unauthorized, status);
    }

    [Fact]
    public async Task Login_finish_with_legacy_pre_fix_credential_returns_401_not_500()
    {
        await using var factory = new GoogleAuthApiFactory();
        var email = $"passkey-legacy-{Guid.NewGuid():N}@example.com";
        var client = await CreateAuthedClientAsync(factory, email);

        // Simulate a credential row written by the pre-T-SEC-01 code: it carries
        // the client-supplied PublicKey and no server-extracted PublicKeyCose.
        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);
        const string legacyCredId = "legacy-insecure-credential";
        const string legacyJson =
            "{\"CredentialId\":\"legacy-insecure-credential\",\"PublicKey\":\"mock-public-key-bytes\","
            + "\"DeviceName\":\"Vieja\",\"CreatedAt\":\"2026-09-01T00:00:00+00:00\",\"SignCount\":0}";
        await users.SetAuthenticationTokenAsync(user!, "Passkeys", "Credential_" + legacyCredId, legacyJson);

        var anonymous = CreateAnonymousClient(factory);
        var (challenge, rpId) = await StartLoginAsync(anonymous);
        var auth = new FakeAuthenticator();
        var status = await LoginFinishAsync(anonymous, legacyCredId, auth, rpId, challenge, signCount: 1);

        Assert.Equal(HttpStatusCode.Unauthorized, status);
    }

    [Fact]
    public async Task Register_finish_accepts_provider_specific_attestation_formats()
    {
        await using var factory = new GoogleAuthApiFactory();
        var email = $"passkey-fmt-{Guid.NewGuid():N}@example.com";
        var client = await CreateAuthedClientAsync(factory, email);
        var authenticator = new FakeAuthenticator();

        // Before the C1 follow-up these were rejected (fmt allowlist + packed
        // self-attestation verification), which locked out real authenticators
        // (Apple "apple", password managers emitting packed with an attestation
        // certificate). Conveyance is "none", so any fmt is accepted now.
        foreach (var (fmt, sig) in new (string, byte[]?)[]
                 {
                     ("apple", null),
                     ("packed", new byte[] { 1, 2, 3, 4 }),
                     ("tpm", null)
                 })
        {
            await EnsureCsrfAsync(client);
            var regStartRes = await client.PostAsJsonAsync("/api/auth/passkeys/register-start", new { });
            Assert.Equal(HttpStatusCode.OK, regStartRes.StatusCode);
            var regStart = await regStartRes.Content.ReadFromJsonAsync<PasskeyRegistrationStartResponse>(JsonOptions);
            Assert.NotNull(regStart);

            var (clientData, attestationObject) = authenticator.BuildAttestation(
                regStart.RpId, regStart.Challenge, DevOrigin, signCount: 0, fmt: fmt, attestationStatementSig: sig);

            await EnsureCsrfAsync(client);
            var res = await client.PostAsJsonAsync("/api/auth/passkeys/register-finish", new
            {
                clientData,
                attestationObject,
                deviceName = $"fmt-{fmt}"
            });

            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        }
    }

    [Fact]
    public async Task Login_finish_accepts_raw_r_s_ecdsa_signatures()
    {
        await using var factory = new GoogleAuthApiFactory();
        var (_, auth, credId) = await RegisterPasskeyAsync(factory);

        var client = CreateAnonymousClient(factory);
        var (challenge, rpId) = await StartLoginAsync(client);

        // Password-manager authenticators (WebCrypto based, e.g. Bitwarden) emit the
        // raw r||s ECDSA pair; the verifier must accept it as well as DER.
        var (clientData, authenticatorData, signature) =
            auth.BuildAssertion(rpId, challenge, DevOrigin, signCount: 1, rawSignature: true);

        await EnsureCsrfAsync(client);
        var res = await client.PostAsJsonAsync("/api/auth/passkeys/login-finish", new
        {
            credentialId = credId,
            clientData,
            authenticatorData,
            signature
        });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }
}
