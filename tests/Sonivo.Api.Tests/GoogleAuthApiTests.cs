using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Infrastructure.Identity;

namespace Sonivo.Api.Tests;

public class GoogleAuthApiTests : IClassFixture<GoogleAuthApiFactory>
{
    private readonly GoogleAuthApiFactory _factory;

    public GoogleAuthApiTests(GoogleAuthApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Providers_reports_google_when_configured()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/auth/providers");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ProvidersResponse>();
        Assert.NotNull(body);
        Assert.True(body.Google);
    }

    [Fact]
    public async Task Providers_reports_google_false_when_unconfigured()
    {
        await using var factory = new SonivoApiFactory();
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/auth/providers");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ProvidersResponse>();
        Assert.NotNull(body);
        Assert.False(body.Google);
    }

    [Fact]
    public async Task Challenge_without_google_returns_404()
    {
        await using var factory = new SonivoApiFactory();
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/api/auth/google");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Challenge_with_google_redirects_to_google()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/api/auth/google?next=/join/tok_abc");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location?.ToString() ?? "";
        Assert.Contains("accounts.google.com", location, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Test_callback_creates_user_and_sets_session()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var email = $"google-new-{Guid.NewGuid():N}@example.com";
        var create = await client.PostAsJsonAsync("/api/auth/google/test-callback", new
        {
            providerKey = $"gk-{Guid.NewGuid():N}",
            email,
            emailVerified = true,
            displayName = "Google User",
            next = "/join/invite1"
        });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var body = await create.Content.ReadFromJsonAsync<TestCallbackResponse>();
        Assert.NotNull(body);
        Assert.Equal(email, body.Email);
        Assert.True(body.EmailConfirmed);
        Assert.Equal("/join/invite1", body.Next);

        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var meBody = await me.Content.ReadFromJsonAsync<MeResponse>();
        Assert.NotNull(meBody);
        Assert.Equal(email, meBody.Email);
        Assert.True(meBody.EmailConfirmed);
    }

    [Fact]
    public async Task Test_callback_links_verified_email_to_existing_password_user()
    {
        var email = $"google-link-{Guid.NewGuid():N}@example.com";
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                Email = email,
                UserName = email,
                EmailConfirmed = false,
                DisplayName = "Password User"
            };
            var created = await users.CreateAsync(user, "Password1a");
            Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
        }

        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var link = await client.PostAsJsonAsync("/api/auth/google/test-callback", new
        {
            providerKey = $"gk-link-{Guid.NewGuid():N}",
            email,
            emailVerified = true,
            displayName = "Google Name",
            next = (string?)null
        });
        Assert.Equal(HttpStatusCode.OK, link.StatusCode);

        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var meBody = await me.Content.ReadFromJsonAsync<MeResponse>();
        Assert.NotNull(meBody);
        Assert.Equal(email, meBody.Email);
        Assert.True(meBody.EmailConfirmed);

        using var verifyScope = _factory.Services.CreateScope();
        var userManager = verifyScope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var stored = await userManager.FindByEmailAsync(email);
        Assert.NotNull(stored);
        var logins = await userManager.GetLoginsAsync(stored);
        Assert.Contains(logins, l => l.LoginProvider == "Google");
    }

    [Fact]
    public async Task Test_callback_rejects_unverified_link_to_existing_user()
    {
        var email = $"google-unverified-{Guid.NewGuid():N}@example.com";
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                Email = email,
                UserName = email
            };
            var created = await users.CreateAsync(user, "Password1a");
            Assert.True(created.Succeeded);
        }

        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var response = await client.PostAsJsonAsync("/api/auth/google/test-callback", new
        {
            providerKey = $"gk-bad-{Guid.NewGuid():N}",
            email,
            emailVerified = false,
            displayName = "Nope",
            next = (string?)null
        });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task Test_callback_sanitizes_unsafe_next()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var response = await client.PostAsJsonAsync("/api/auth/google/test-callback", new
        {
            providerKey = $"gk-next-{Guid.NewGuid():N}",
            email = $"google-next-{Guid.NewGuid():N}@example.com",
            emailVerified = true,
            displayName = "Next User",
            next = "https://evil.example/phish"
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<TestCallbackResponse>();
        Assert.NotNull(body);
        Assert.Null(body.Next);
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()
            ?? throw new InvalidOperationException("Missing CSRF token");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private sealed record ProvidersResponse(bool Google);
    private sealed record TestCallbackResponse(Guid Id, string? Email, string? DisplayName, bool EmailConfirmed, string? Next);
    private sealed record MeResponse(Guid Id, string? Email, string? DisplayName, bool EmailConfirmed);
}

public sealed class GoogleAuthApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"sonivo-google-{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("UseInMemoryDatabase", "true");
        builder.UseSetting("InMemoryDatabaseName", _dbName);
        builder.UseSetting("ConnectionStrings:Default", "Host=unused;Database=unused;Username=unused;Password=unused");
        builder.UseSetting("Gmail:ClientId", "");
        builder.UseSetting("Gmail:ClientSecret", "");
        builder.UseSetting("Gmail:RefreshToken", "");
        builder.UseSetting("Gmail:From", "");
        builder.UseSetting("PublicOrigin", "");
        builder.UseSetting("Authentication:Google:ClientId", "test-google-client-id.apps.googleusercontent.com");
        builder.UseSetting("Authentication:Google:ClientSecret", "test-google-client-secret");
        builder.UseSetting("Authentication:Google:EnableTestHook", "true");
    }
}
