using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Tests;

/// <summary>
/// T-AU-01 API matrix: verification gate + confirm/resend/forgot/reset.
/// Token happy paths use white-box generated UserManager tokens (no mailbox).
/// </summary>
public class VerificationApiTests : IClassFixture<SonivoApiFactory>
{
    private const string InvalidLinkCopy = "Enlace expirado o inválido — solicita uno nuevo";
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public VerificationApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Register_returns_unconfirmed_with_mailed_flag_and_does_not_sign_in()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "verify-new@example.com",
            password = "Password1",
            displayName = "Verify New"
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<RegisterResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.False(body.EmailConfirmed);
        Assert.False(body.Mailed); // email transport unconfigured in tests → best-effort false

        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task Register_duplicate_still_returns_409()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var first = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "verify-dup@example.com",
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        await EnsureCsrfAsync(client);
        var second = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "verify-dup@example.com",
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Unverified_login_returns_identical_401_as_bad_credentials()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "verify-gate@example.com",
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        await EnsureCsrfAsync(client);
        var unverified = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "verify-gate@example.com",
            password = "Password1"
        });
        await EnsureCsrfAsync(client);
        var wrongPassword = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "verify-gate@example.com",
            password = "WrongPass1"
        });
        await EnsureCsrfAsync(client);
        var unknownEmail = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "verify-unknown@example.com",
            password = "Password1"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, unverified.StatusCode);
        var unverifiedProblem = await unverified.Content.ReadFromJsonAsync<ProblemShape>(JsonOptions);
        var wrongProblem = await wrongPassword.Content.ReadFromJsonAsync<ProblemShape>(JsonOptions);
        var unknownProblem = await unknownEmail.Content.ReadFromJsonAsync<ProblemShape>(JsonOptions);

        // No new oracle: unverified denial carries the identical status /
        // title / detail as bad credentials (only the per-request traceId differs).
        Assert.NotNull(unverifiedProblem);
        Assert.Equal(unknownProblem?.Title, unverifiedProblem.Title);
        Assert.Equal(unknownProblem?.Detail, unverifiedProblem.Detail);
        Assert.Equal(unknownProblem?.Status, unverifiedProblem.Status);
        Assert.Equal(wrongProblem?.Title, unverifiedProblem.Title);
        Assert.Equal(wrongProblem?.Detail, unverifiedProblem.Detail);
        Assert.Equal("Invalid email or password.", unverifiedProblem.Detail);
    }

    /// <summary>
    /// ADR-0038 (owner-authorized refinement): the login screen may reveal the
    /// verification affordance only when the password was already correct.
    /// Identity's <c>IsNotAllowed</c> is that branch, so the marker is
    /// unreachable without a valid credential and cannot be used to discover
    /// whether an address is registered.
    /// </summary>
    [Fact]
    public async Task Only_a_correct_password_on_an_unverified_account_reports_email_unverified()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "verify-marker@example.com",
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        for (var attempt = 0; attempt < 4; attempt++)
        {
            await EnsureCsrfAsync(client);
            var failedLogin = await client.PostAsJsonAsync("/api/auth/login", new
            {
                email = "verify-marker@example.com",
                password = "WrongPass1"
            });
            Assert.Equal(HttpStatusCode.Unauthorized, failedLogin.StatusCode);
            Assert.Null(Reason(await ReadAsync(failedLogin)));
        }

        await EnsureCsrfAsync(client);
        var unverified = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "verify-marker@example.com",
            password = "Password1"
        });

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync("verify-marker@example.com");
            Assert.NotNull(user);
            Assert.Equal(0, await users.GetAccessFailedCountAsync(user));
        }

        await EnsureCsrfAsync(client);
        var wrongPassword = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "verify-marker@example.com",
            password = "WrongPass1"
        });
        await EnsureCsrfAsync(client);
        var unknownEmail = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "verify-marker-unknown@example.com",
            password = "Password1"
        });

        var unverifiedBody = await ReadAsync(unverified);
        var wrongBody = await ReadAsync(wrongPassword);
        var unknownBody = await ReadAsync(unknownEmail);

        Assert.Equal(HttpStatusCode.Unauthorized, unverified.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.StatusCode);

        // The correct-password/not-allowed branch is the ONLY one that carries
        // the marker...
        Assert.Equal("email_unverified", Reason(unverifiedBody));

        // ...and no other failure path does, so nothing about account existence
        // leaks to a caller without the right password.
        Assert.Null(Reason(wrongBody));
        Assert.Null(Reason(unknownBody));

        // All three keep the same status/title/detail.
        Assert.Equal("Invalid email or password.", unverifiedBody?.Detail);
        Assert.Equal(unverifiedBody?.Title, wrongBody?.Title);
        Assert.Equal(unverifiedBody?.Detail, wrongBody?.Detail);
        Assert.Equal(unverifiedBody?.Status, wrongBody?.Status);
        Assert.Equal(unverifiedBody?.Status, unknownBody?.Status);
    }

    [Fact]
    public async Task Wrong_password_attempts_on_unverified_account_consume_lockout_budget()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);

        const string email = "verify-unconfirmed-lockout@example.com";
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        for (var attempt = 0; attempt < 4; attempt++)
        {
            await EnsureCsrfAsync(client);
            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                email,
                password = "WrongPass1"
            });

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var body = await ReadAsync(response);
            Assert.Null(Reason(body));
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);
            Assert.True(users.SupportsUserLockout);
            Assert.True(await users.GetLockoutEnabledAsync(user));
            Assert.Equal(4, await users.GetAccessFailedCountAsync(user));
        }

        await EnsureCsrfAsync(client);
        var fifthFailure = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "WrongPass1"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, fifthFailure.StatusCode);
        Assert.Null(Reason(await ReadAsync(fifthFailure)));

        // Identity clears the counter as it starts the lockout window.
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);
            Assert.Equal(0, await users.GetAccessFailedCountAsync(user));
            Assert.True(await users.IsLockedOutAsync(user));
        }

        await EnsureCsrfAsync(client);
        var correctPasswordWhileLocked = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, correctPasswordWhileLocked.StatusCode);
        Assert.Null(Reason(await ReadAsync(correctPasswordWhileLocked)));
    }

    private static async Task<ProblemShapeWithExtensions?> ReadAsync(HttpResponseMessage response)
    {
        return await response.Content.ReadFromJsonAsync<ProblemShapeWithExtensions>(JsonOptions);
    }

    private static string? Reason(ProblemShapeWithExtensions? body) => body?.Reason;

    [Fact]
    public async Task Resend_for_unknown_email_returns_202()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation",
            new { email = "verify-nobody@example.com" });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AcceptedResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.True(body.Accepted);
        Assert.False(body.Mailed);
    }

    [Fact]
    public async Task Forgot_for_unknown_email_returns_202()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/auth/forgot-password",
            new { email = "verify-nobody-forgot@example.com" });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AcceptedResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.True(body.Accepted);
    }

    [Fact]
    public async Task Resend_for_confirmed_user_returns_202_without_mail()
    {
        var client = await CreateVerifiedClientAsync("verify-resend-done@example.com");
        await EnsureCsrfAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation",
            new { email = "verify-resend-done@example.com" });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AcceptedResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.True(body.Accepted);
        Assert.False(body.Mailed);
    }

    [Fact]
    public async Task Confirm_happy_path_then_login_succeeds()
    {
        var email = "verify-happy@example.com";
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        var token = await GenerateConfirmTokenAsync(email);
        await EnsureCsrfAsync(client);
        var confirm = await client.PostAsJsonAsync(
            "/api/auth/confirm-email",
            new { email, token });
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        var confirmed = await confirm.Content.ReadFromJsonAsync<ConfirmResponse>(JsonOptions);
        Assert.NotNull(confirmed);
        Assert.True(confirmed.EmailConfirmed);

        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Confirm_with_invalid_token_returns_400_Spanish()
    {
        var email = "verify-badtoken@example.com";
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        await EnsureCsrfAsync(client);
        var confirm = await client.PostAsJsonAsync(
            "/api/auth/confirm-email",
            new { email, token = "not-a-real-token" });
        Assert.Equal(HttpStatusCode.BadRequest, confirm.StatusCode);
        var body = await confirm.Content.ReadAsStringAsync();
        Assert.Contains(InvalidLinkCopy, body);
    }

    [Fact]
    public async Task Confirm_token_reuse_is_denied()
    {
        var email = "verify-reuse@example.com";
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        var token = await GenerateConfirmTokenAsync(email);
        await EnsureCsrfAsync(client);
        var first = await client.PostAsJsonAsync("/api/auth/confirm-email", new { email, token });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        await EnsureCsrfAsync(client);
        var second = await client.PostAsJsonAsync("/api/auth/confirm-email", new { email, token });
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        var body = await second.Content.ReadAsStringAsync();
        Assert.Contains(InvalidLinkCopy, body);
    }

    [Fact]
    public async Task Reset_happy_path_then_token_reuse_denied()
    {
        var email = "verify-reset@example.com";
        var client = await CreateVerifiedClientAsync(email);

        var token = await GenerateResetTokenAsync(email);
        await EnsureCsrfAsync(client);
        var reset = await client.PostAsJsonAsync("/api/auth/reset-password", new
        {
            email,
            token,
            newPassword = "NewPass1a"
        });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        await EnsureCsrfAsync(client);
        var reuse = await client.PostAsJsonAsync("/api/auth/reset-password", new
        {
            email,
            token,
            newPassword = "Another1a"
        });
        Assert.Equal(HttpStatusCode.BadRequest, reuse.StatusCode);
        var reuseBody = await reuse.Content.ReadAsStringAsync();
        Assert.Contains(InvalidLinkCopy, reuseBody);

        var loginClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(loginClient);
        var login = await loginClient.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "NewPass1a"
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Reset_with_invalid_token_returns_400_Spanish()
    {
        var email = "verify-reset-bad@example.com";
        var client = await CreateVerifiedClientAsync(email);
        await EnsureCsrfAsync(client);

        var reset = await client.PostAsJsonAsync("/api/auth/reset-password", new
        {
            email,
            token = "not-a-real-token",
            newPassword = "NewPass1a"
        });
        Assert.Equal(HttpStatusCode.BadRequest, reset.StatusCode);
        var body = await reset.Content.ReadAsStringAsync();
        Assert.Contains(InvalidLinkCopy, body);
    }

    [Fact]
    public async Task Locked_out_login_returns_the_identical_401_shape_as_unknown_email()
    {
        var email = "verify-lockout@example.com";
        await CreateVerifiedClientAsync(email);

        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        // Burn the lockout budget (5 failed attempts).
        for (var i = 0; i < 5; i++)
        {
            await EnsureCsrfAsync(client);
            var attempt = await client.PostAsJsonAsync("/api/auth/login",
                new { email, password = "WrongPass1", rememberMe = false });
            Assert.Equal(HttpStatusCode.Unauthorized, attempt.StatusCode);
        }

        // SECURITY-AUDIT-2026-10 (A1): the locked-out 401 carries the identical
        // status/title/detail as an unknown email — lockout must not reveal
        // account existence.
        await EnsureCsrfAsync(client);
        var locked = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "Password1", rememberMe = false });
        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        var lockedProblem = await locked.Content.ReadFromJsonAsync<ProblemShape>(JsonOptions);

        await EnsureCsrfAsync(client);
        var unknown = await client.PostAsJsonAsync("/api/auth/login",
            new { email = "verify-lockout-unknown@example.com", password = "Password1", rememberMe = false });
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        var unknownProblem = await unknown.Content.ReadFromJsonAsync<ProblemShape>(JsonOptions);

        Assert.Equal(unknownProblem?.Status, lockedProblem?.Status);
        Assert.Equal(unknownProblem?.Title, lockedProblem?.Title);
        Assert.Equal(unknownProblem?.Detail, lockedProblem?.Detail);
    }

    private async Task<HttpClient> CreateVerifiedClientAsync(string email, string password = "Password1")
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

    private async Task<string> GenerateConfirmTokenAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email)
            ?? throw new InvalidOperationException($"Test user not found: {email}");
        return await users.GenerateEmailConfirmationTokenAsync(user);
    }

    private async Task<string> GenerateResetTokenAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email)
            ?? throw new InvalidOperationException($"Test user not found: {email}");
        return await users.GeneratePasswordResetTokenAsync(user);
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
    private sealed record ProblemShape(string? Title, string? Detail, int? Status);

    /// <summary>
    /// Problem details plus the top-level extension entries that
    /// <c>Results.Problem(extensions: …)</c> flattens into the response body.
    /// </summary>
    private sealed record ProblemShapeWithExtensions(
        string? Title,
        string? Detail,
        int? Status,
        string? Reason);
    private sealed record RegisterResponse(Guid Id, string? Email, bool EmailConfirmed, bool Mailed);
    private sealed record AcceptedResponse(bool Accepted, bool Mailed);
    private sealed record ConfirmResponse(bool EmailConfirmed);
}
