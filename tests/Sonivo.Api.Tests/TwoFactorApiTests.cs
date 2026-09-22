using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Tests;

/// <summary>
/// T-AU-02 API matrix + unit coverage: TOTP enroll/verify/disable,
/// recovery codes (single-use, shown once), second-step login, challenge
/// lockout, Google-only (passwordless) enrollment without password recheck.
/// TOTP codes are computed in-test per RFC 6238 (SHA-1, 30 s step, 6 digits),
/// matching the Identity authenticator provider — no fixed secrets.
/// Uses the Google-enabled factory so the passwordless session path
/// (google/test-callback) is available for the S38-Q2 case.
/// </summary>
public class TwoFactorApiTests : IClassFixture<GoogleAuthApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly GoogleAuthApiFactory _factory;

    public TwoFactorApiTests(GoogleAuthApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Enroll_start_returns_uri_and_manual_key_then_verify_enables_with_codes_once()
    {
        var client = await CreatePasswordClientAsync($"2fa-enroll-{Guid.NewGuid():N}@example.com");
        await EnsureCsrfAsync(client);

        var start = await client.PostAsJsonAsync("/api/auth/2fa/enroll-start", new { });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<EnrollStartResponse>(JsonOptions);
        Assert.NotNull(started);
        Assert.StartsWith("otpauth://totp/", started.Uri, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secret=", started.Uri, StringComparison.OrdinalIgnoreCase);
        Assert.False(string.IsNullOrWhiteSpace(started.ManualKey));

        var code = TotpHelper.ComputeCode(started.ManualKey);
        await EnsureCsrfAsync(client);
        var verify = await client.PostAsJsonAsync("/api/auth/2fa/enroll-verify", new { code });
        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
        var verified = await verify.Content.ReadFromJsonAsync<EnrollVerifyResponse>(JsonOptions);
        Assert.NotNull(verified);
        Assert.True(verified.Enabled);
        Assert.NotNull(verified.RecoveryCodes);
        Assert.Equal(10, verified.RecoveryCodes.Count);

        await EnsureCsrfAsync(client);
        var status = await client.GetAsync("/api/auth/2fa/status");
        var statusBody = await status.Content.ReadFromJsonAsync<TwoFactorStatus>(JsonOptions);
        Assert.NotNull(statusBody);
        Assert.True(statusBody.Enabled);
        Assert.True(statusBody.HasPassword);
    }

    [Fact]
    public async Task Enroll_verify_with_wrong_code_is_denied_in_Spanish()
    {
        var client = await CreatePasswordClientAsync($"2fa-badcode-{Guid.NewGuid():N}@example.com");
        await EnsureCsrfAsync(client);

        var start = await client.PostAsJsonAsync("/api/auth/2fa/enroll-start", new { });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);

        await EnsureCsrfAsync(client);
        var verify = await client.PostAsJsonAsync("/api/auth/2fa/enroll-verify", new { code = "000000" });
        Assert.Equal(HttpStatusCode.BadRequest, verify.StatusCode);
        var body = await verify.Content.ReadAsStringAsync();
        Assert.Contains("incorrecto", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Login_with_2FA_returns_second_step_without_session()
    {
        var email = $"2fa-step-{Guid.NewGuid():N}@example.com";
        var client = await CreatePasswordClientAsync(email);
        await EnableTwoFactorAsync(client);

        var stepClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(stepClient);
        var login = await stepClient.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.TryGetProperty("requiresTwoFactor", out var flag));
        Assert.True(flag.GetBoolean());

        // NO app session yet: the temp 2FA cookie is not the session.
        var me = await stepClient.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task Challenge_happy_path_signs_in()
    {
        var email = $"2fa-challenge-{Guid.NewGuid():N}@example.com";
        var client = await CreatePasswordClientAsync(email);
        var manualKey = (await EnableTwoFactorAsync(client)).ManualKey;

        var stepClient = await LoginToSecondStepAsync(email);
        await EnsureCsrfAsync(stepClient);
        var challenge = await stepClient.PostAsJsonAsync("/api/auth/2fa/challenge", new
        {
            code = TotpHelper.ComputeCode(manualKey)
        });
        Assert.Equal(HttpStatusCode.OK, challenge.StatusCode);
        var user = await challenge.Content.ReadFromJsonAsync<MeResponse>(JsonOptions);
        Assert.NotNull(user);
        Assert.Equal(email, user.Email);

        var me = await stepClient.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    [Fact]
    public async Task Challenge_wrong_code_denied_and_repeated_failures_lock_out()
    {
        // Fresh factory: the strict 10/min challenge budget + lockout state
        // must not leak from other tests sharing the class fixture.
        await using var factory = new GoogleAuthApiFactory();
        var email = $"2fa-lockout-{Guid.NewGuid():N}@example.com";
        var client = await CreatePasswordClientAsync(factory, email);
        await EnableTwoFactorAsync(client);

        var stepClient = await LoginToSecondStepAsync(factory, email);
        for (var i = 0; i < 5; i++)
        {
            await EnsureCsrfAsync(stepClient);
            var denied = await stepClient.PostAsJsonAsync(
                "/api/auth/2fa/challenge", new { code = "000000" });
            Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        }

        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);
            Assert.True(await users.IsLockedOutAsync(user));
        }

        await EnsureCsrfAsync(stepClient);
        var locked = await stepClient.PostAsJsonAsync(
            "/api/auth/2fa/challenge", new { code = "000000" });
        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        var body = await locked.Content.ReadAsStringAsync();
        Assert.Contains("locked", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Challenge_without_pending_second_step_is_denied()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var challenge = await client.PostAsJsonAsync(
            "/api/auth/2fa/challenge", new { code = "123456" });
        Assert.Equal(HttpStatusCode.Unauthorized, challenge.StatusCode);
    }

    [Fact]
    public async Task Recovery_code_signs_in_once_then_is_consumed()
    {
        var email = $"2fa-recover-{Guid.NewGuid():N}@example.com";
        var client = await CreatePasswordClientAsync(email);
        var recoveryCode = (await EnableTwoFactorAsync(client, returnRecoveryCodes: true)).RecoveryCodes![0];

        var stepClient = await LoginToSecondStepAsync(email);
        await EnsureCsrfAsync(stepClient);
        var recover = await stepClient.PostAsJsonAsync("/api/auth/2fa/recover", new { code = recoveryCode });
        Assert.Equal(HttpStatusCode.OK, recover.StatusCode);
        var me = await stepClient.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);

        // Same code is single-use: a fresh second step must reject the reuse.
        var retryClient = await LoginToSecondStepAsync(email);
        await EnsureCsrfAsync(retryClient);
        var reuse = await retryClient.PostAsJsonAsync("/api/auth/2fa/recover", new { code = recoveryCode });
        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);
    }

    [Fact]
    public async Task Google_only_user_enrolls_and_disables_without_password()
    {
        // S38-Q2 (b): passwordless accounts enroll with session auth + CSRF
        // only — there is no password hash to recheck.
        var email = $"2fa-google-{Guid.NewGuid():N}@example.com";
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        var callback = await client.PostAsJsonAsync("/api/auth/google/test-callback", new
        {
            providerKey = $"gk-2fa-{Guid.NewGuid():N}",
            email,
            emailVerified = true,
            displayName = "Google 2FA",
            next = (string?)null
        });
        Assert.Equal(HttpStatusCode.OK, callback.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);
            Assert.False(await users.HasPasswordAsync(user));
        }

        await EnsureCsrfAsync(client);
        var start = await client.PostAsJsonAsync("/api/auth/2fa/enroll-start", new { });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<EnrollStartResponse>(JsonOptions);
        Assert.NotNull(started);

        await EnsureCsrfAsync(client);
        var verify = await client.PostAsJsonAsync("/api/auth/2fa/enroll-verify", new
        {
            code = TotpHelper.ComputeCode(started.ManualKey)
        });
        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);

        // Disable skips the password recheck for passwordless accounts.
        await EnsureCsrfAsync(client);
        var disable = await client.PostAsJsonAsync("/api/auth/2fa/disable", new { });
        Assert.Equal(HttpStatusCode.OK, disable.StatusCode);
    }

    [Fact]
    public async Task Disable_with_password_requires_recheck()
    {
        var email = $"2fa-disable-{Guid.NewGuid():N}@example.com";
        var client = await CreatePasswordClientAsync(email);
        await EnableTwoFactorAsync(client);

        await EnsureCsrfAsync(client);
        var wrong = await client.PostAsJsonAsync("/api/auth/2fa/disable", new { password = "WrongPass1" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        var wrongBody = await wrong.Content.ReadAsStringAsync();
        Assert.Contains("contraseña", wrongBody, StringComparison.OrdinalIgnoreCase);

        await EnsureCsrfAsync(client);
        var missing = await client.PostAsJsonAsync("/api/auth/2fa/disable", new { });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);

        await EnsureCsrfAsync(client);
        var disable = await client.PostAsJsonAsync("/api/auth/2fa/disable", new { password = "Password1" });
        Assert.Equal(HttpStatusCode.OK, disable.StatusCode);

        // Password login is a full session again — no second step.
        var loginClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(loginClient);
        var login = await loginClient.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.TryGetProperty("requiresTwoFactor", out _));
    }

    [Fact]
    public async Task Regenerate_recovery_codes_returns_fresh_single_shot_codes()
    {
        var email = $"2fa-regen-{Guid.NewGuid():N}@example.com";
        var client = await CreatePasswordClientAsync(email);
        var first = (await EnableTwoFactorAsync(client, returnRecoveryCodes: true)).RecoveryCodes!;

        await EnsureCsrfAsync(client);
        var regen = await client.PostAsJsonAsync(
            "/api/auth/2fa/recovery-codes/regenerate", new { password = "Password1" });
        Assert.Equal(HttpStatusCode.OK, regen.StatusCode);
        var regenerated = await regen.Content.ReadFromJsonAsync<RegenerateResponse>(JsonOptions);
        Assert.NotNull(regenerated);
        Assert.NotNull(regenerated.RecoveryCodes);
        Assert.Equal(10, regenerated.RecoveryCodes.Count);
        Assert.Empty(regenerated.RecoveryCodes.Intersect(first));

        // Old codes are dead: a fresh second step rejects one.
        var stepClient = await LoginToSecondStepAsync(email);
        await EnsureCsrfAsync(stepClient);
        var stale = await stepClient.PostAsJsonAsync("/api/auth/2fa/recover", new { code = first[0] });
        Assert.Equal(HttpStatusCode.Unauthorized, stale.StatusCode);
    }

    [Fact]
    public async Task Totp_previous_step_code_verifies_within_drift_window()
    {
        var email = $"2fa-drift-{Guid.NewGuid():N}@example.com";
        string key;
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                Email = email,
                UserName = email,
                EmailConfirmed = true
            };
            Assert.True((await users.CreateAsync(user, "Password1")).Succeeded);
            await users.ResetAuthenticatorKeyAsync(user);
            key = (await users.GetAuthenticatorKeyAsync(user))!;
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = (await users.FindByEmailAsync(email))!;
            // Previous 30 s step: clock drift must still verify.
            Assert.True(await users.VerifyTwoFactorTokenAsync(
                user, TokenOptions.DefaultAuthenticatorProvider, TotpHelper.ComputeCode(key, -1)));
            // Current step verifies.
            Assert.True(await users.VerifyTwoFactorTokenAsync(
                user, TokenOptions.DefaultAuthenticatorProvider, TotpHelper.ComputeCode(key)));
            // Far-away code must not verify.
            Assert.False(await users.VerifyTwoFactorTokenAsync(
                user, TokenOptions.DefaultAuthenticatorProvider, TotpHelper.ComputeCode(key, -10)));
        }
    }

    [Fact]
    public async Task Recovery_codes_are_single_use_at_rest()
    {
        var email = $"2fa-single-{Guid.NewGuid():N}@example.com";
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                Email = email,
                UserName = email,
                EmailConfirmed = true
            };
            Assert.True((await users.CreateAsync(user, "Password1")).Succeeded);
            var codes = (await users.GenerateNewTwoFactorRecoveryCodesAsync(user, 10))!.ToList();
            Assert.Equal(10, codes.Count);
            Assert.True((await users.RedeemTwoFactorRecoveryCodeAsync(user, codes[0])).Succeeded);
            Assert.False((await users.RedeemTwoFactorRecoveryCodeAsync(user, codes[0])).Succeeded);
        }
    }

    private async Task<HttpClient> CreatePasswordClientAsync(string email, string password = "Password1")
        => await CreatePasswordClientAsync(_factory, email, password);

    private static async Task<HttpClient> CreatePasswordClientAsync(
        GoogleAuthApiFactory factory, string email, string password = "Password1")
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
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

        await AuthTestHelper.ConfirmEmailAsync(factory.Services, email);
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

    /// <summary>Enables 2FA over HTTP; returns the manual key (and codes on demand).</summary>
    private static async Task<EnabledTwoFactor> EnableTwoFactorAsync(
        HttpClient client, bool returnRecoveryCodes = false)
    {
        await EnsureCsrfAsync(client);
        var start = await client.PostAsJsonAsync("/api/auth/2fa/enroll-start", new { });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<EnrollStartResponse>(JsonOptions);
        Assert.NotNull(started);

        await EnsureCsrfAsync(client);
        var verify = await client.PostAsJsonAsync("/api/auth/2fa/enroll-verify", new
        {
            code = TotpHelper.ComputeCode(started.ManualKey)
        });
        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
        List<string>? codes = null;
        if (returnRecoveryCodes)
        {
            var verified = await verify.Content.ReadFromJsonAsync<EnrollVerifyResponse>(JsonOptions);
            codes = verified?.RecoveryCodes;
            Assert.NotNull(codes);
        }

        return new EnabledTwoFactor(started.ManualKey, codes);
    }

    private async Task<HttpClient> LoginToSecondStepAsync(string email, string password = "Password1")
        => await LoginToSecondStepAsync(_factory, email, password);

    private static async Task<HttpClient> LoginToSecondStepAsync(
        GoogleAuthApiFactory factory, string email, string password = "Password1")
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
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
    private sealed record EnrollStartResponse(string Uri, string ManualKey);
    private sealed record EnrollVerifyResponse(bool Enabled, List<string>? RecoveryCodes);
    private sealed record TwoFactorStatus(bool Enabled, bool HasPassword);
    private sealed record RegenerateResponse(List<string>? RecoveryCodes);
    private sealed record EnabledTwoFactor(string ManualKey, List<string>? RecoveryCodes = null)
    {
        public string ManualKey { get; } = ManualKey;
        public List<string>? RecoveryCodes { get; } = RecoveryCodes;
    }
}

/// <summary>
/// RFC 6238 TOTP (SHA-1, 30 s step, 6 digits) — the same parameters as the
/// Identity authenticator provider. Test-only deterministic code source.
/// </summary>
internal static class TotpHelper
{
    internal static string ComputeCode(string base32Secret, long stepOffset = 0)
    {
        var key = Base32Decode(base32Secret);
        var counter = (ulong)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30 + stepOffset);
        var counterBytes = BitConverter.GetBytes(counter);
        if (BitConverter.IsLittleEndian)
        {
            Array.Reverse(counterBytes);
        }

        using var hmac = new HMACSHA1(key);
        var hash = hmac.ComputeHash(counterBytes);
        var offset = hash[^1] & 0x0F;
        var code = ((hash[offset] & 0x7F) << 24)
            | (hash[offset + 1] << 16)
            | (hash[offset + 2] << 8)
            | hash[offset + 3];
        return (code % 1_000_000).ToString("D6", CultureInfo.InvariantCulture);
    }

    private static byte[] Base32Decode(string input)
    {
        var text = input.Trim().TrimEnd('=').ToUpperInvariant();
        var output = new List<byte>();
        var buffer = 0;
        var bitsLeft = 0;
        foreach (var c in text)
        {
            var value = c is >= 'A' and <= 'Z' ? c - 'A' : c - '2' + 26;
            if (value is < 0 or > 31)
            {
                throw new FormatException($"Invalid base32 character: {c}");
            }

            buffer = (buffer << 5) | value;
            bitsLeft += 5;
            if (bitsLeft >= 8)
            {
                output.Add((byte)(buffer >> (bitsLeft - 8)));
                bitsLeft -= 8;
                buffer &= (1 << bitsLeft) - 1;
            }
        }

        return output.ToArray();
    }
}
