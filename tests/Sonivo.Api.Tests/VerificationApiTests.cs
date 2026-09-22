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
        Assert.False(body.Mailed); // Gmail unconfigured in tests → best-effort false

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
    private sealed record RegisterResponse(Guid Id, string? Email, bool EmailConfirmed, bool Mailed);
    private sealed record AcceptedResponse(bool Accepted, bool Mailed);
    private sealed record ConfirmResponse(bool EmailConfirmed);
}
