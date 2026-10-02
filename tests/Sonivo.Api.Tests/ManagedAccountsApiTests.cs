using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

/// <summary>
/// Phase 4.1 (F3a): managed-account foundation — MustChangePassword enforcement,
/// the change-password endpoint and the AccountAudit trail.
/// </summary>
public class ManagedAccountsApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public ManagedAccountsApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Must_change_password_blocks_the_api_until_changed()
    {
        var email = $"managed-{Guid.NewGuid():N}@example.com";
        var client = await CreateAuthenticatedClientAsync(email);
        await SetMustChangePasswordAsync(email);

        // me still works and reports the flag.
        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me");
        Assert.NotNull(me);
        Assert.True(me.MustChangePassword);

        // Every other API call is blocked with the machine-readable code.
        var blocked = await client.GetAsync("/api/groups");
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
        var body = await blocked.Content.ReadAsStringAsync();
        Assert.Contains("must_change_password", body);

        // Change the password (wrong current password first).
        var wrong = await client.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = "WrongPass1", newPassword = "NuevaClave1" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);

        var changed = await client.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = "Password1", newPassword = "NuevaClave1" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);

        // Access is restored and the flag is cleared.
        var after = await client.GetAsync("/api/groups");
        Assert.Equal(HttpStatusCode.OK, after.StatusCode);
        var meAfter = await client.GetFromJsonAsync<MeResponse>("/api/auth/me");
        Assert.False(meAfter!.MustChangePassword);

        // The change was audited (ids only).
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
        Assert.True(await db.AccountAudits.AnyAsync(a => a.Action == AccountAudit.ActionPasswordChanged));
    }

    [Fact]
    public async Task Anonymous_change_password_is_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = "x", newPassword = "y" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password = "Password1")
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        await client.PostAsJsonAsync("/api/auth/register", new { email, password, displayName = email });
        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password, rememberMe = false });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private async Task SetMustChangePasswordAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);
        user!.MustChangePassword = true;
        var result = await users.UpdateAsync(user);
        Assert.True(result.Succeeded, string.Join(", ", result.Errors.Select(e => e.Description)));
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

    private sealed record MeResponse(Guid Id, string? Email, string? DisplayName, bool EmailConfirmed, bool MustChangePassword);
}
