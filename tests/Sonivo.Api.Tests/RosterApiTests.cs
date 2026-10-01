using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

/// <summary>Phase 4.1: roster incl. people without an account (Features:ManagedAccounts).</summary>
public class RosterApiTests : IClassFixture<SonivoApiFactory>, IClassFixture<GroupBrandingOffFactory>
{
    private readonly SonivoApiFactory _factory;
    private readonly GroupBrandingOffFactory _factoryOff;

    public RosterApiTests(SonivoApiFactory factory, GroupBrandingOffFactory factoryOff)
    {
        _factory = factory;
        _factoryOff = factoryOff;
    }

    [Fact]
    public async Task Roster_lists_people_with_and_without_access()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "roster-owner@example.com");
        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Roster Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            await db.Memberships.AddAsync(Membership.CreatePerson(created.Id, "Persona Sin Cuenta", DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        }

        var roster = await client.GetFromJsonAsync<RosterResponse>($"/api/groups/{created.Id}/roster");
        Assert.NotNull(roster);
        Assert.Contains(roster.Items, i => i.Role == "Owner" && i.HasAccess);
        var person = roster.Items.SingleOrDefault(i => i.DisplayName == "Persona Sin Cuenta");
        Assert.NotNull(person);
        Assert.False(person!.HasAccess);
        Assert.Null(person.UserId);
    }

    [Fact]
    public async Task Roster_is_404_when_the_flag_is_off()
    {
        var client = await CreateAuthenticatedClientAsync(_factoryOff, "roster-off@example.com");
        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Off Roster" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var response = await client.GetAsync($"/api/groups/{created.Id}/roster");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Owner_provisions_access_with_a_one_use_temporary_password()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "roster-prov@example.com");
        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Prov Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var response = await client.PostAsJsonAsync($"/api/groups/{created.Id}/roster",
            new { displayName = "Sin Correo", grantAccess = true });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ProvisionResponse>();
        Assert.NotNull(body);
        Assert.Equal("temporary_password", body.Credential);
        Assert.False(string.IsNullOrWhiteSpace(body.TemporaryPassword));

        var roster = await client.GetFromJsonAsync<RosterResponse>($"/api/groups/{created.Id}/roster");
        var person = roster!.Items.Single(i => i.DisplayName == "Sin Correo");
        Assert.True(person.HasAccess);

        // The provisioned account is owned by this group (resettable by its Owner).
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var account = await users.FindByIdAsync(person.UserId!.Value.ToString("D"));
        Assert.NotNull(account);
        Assert.Equal(created.Id, account!.ManagedByGroupId);
        Assert.True(account.MustChangePassword);
    }

    [Fact]
    public async Task Provisioning_never_takes_over_an_existing_account()
    {
        await CreateAuthenticatedClientAsync(_factory, "existing-account@example.com");
        var client = await CreateAuthenticatedClientAsync(_factory, "roster-clash@example.com");
        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Clash Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var response = await client.PostAsJsonAsync($"/api/groups/{created.Id}/roster",
            new { displayName = "Intruso", email = "existing-account@example.com", grantAccess = true });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Only_accounts_created_by_the_group_are_resettable()
    {
        // A pre-existing account (no ManagedByGroupId) linked as a member must not be resettable.
        var userId = Guid.NewGuid();
        var email = $"preexisting-{userId:N}@example.com";
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            var user = new ApplicationUser { Id = userId, Email = email, UserName = email, DisplayName = email, EmailConfirmed = true };
            var created = await users.CreateAsync(user, "Password1");
            Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
        }

        var client = await CreateAuthenticatedClientAsync(_factory, "roster-reset@example.com");
        var group = await (await client.PostAsJsonAsync("/api/groups", new { name = "Reset Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(group);

        Guid memberId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            var membership = Membership.CreateMember(group.Id, userId, DateTimeOffset.UtcNow);
            await db.Memberships.AddAsync(membership);
            await db.SaveChangesAsync();
            memberId = membership.Id;
        }

        var response = await client.PostAsJsonAsync($"/api/groups/{group.Id}/roster/{memberId}/reset-access", new { });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }


    [Fact]
    public async Task Verified_reset_makes_a_managed_account_self_owned()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "roster-lifecycle@example.com");
        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Lifecycle Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        await client.PostAsJsonAsync($"/api/groups/{created.Id}/roster",
            new { displayName = "Auto", grantAccess = true });

        Guid userId;
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var roster = await client.GetFromJsonAsync<RosterResponse>($"/api/groups/{created.Id}/roster");
            var person = roster!.Items.Single(i => i.DisplayName == "Auto");
            var account = await users.FindByIdAsync(person.UserId!.Value.ToString("D"));
            Assert.NotNull(account);
            Assert.Equal(created.Id, account!.ManagedByGroupId);
            userId = account.Id;

            var token = await users.GeneratePasswordResetTokenAsync(account);
            var anon = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
            await EnsureCsrfAsync(anon);
            var reset = await anon.PostAsJsonAsync("/api/auth/reset-password",
                new { email = account.Email, token, newPassword = "NuevaClave1" });
            Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var account = await users.FindByIdAsync(userId.ToString("D"));
            Assert.NotNull(account);
            Assert.Null(account!.ManagedByGroupId);
            Assert.False(account.MustChangePassword);
        }
    }

    [Fact]
    public async Task Deleting_a_roster_row_removes_the_managed_account_used_only_here()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "roster-delete@example.com");
        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Delete Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var provision = await client.PostAsJsonAsync($"/api/groups/{created.Id}/roster",
            new { displayName = "Temp", grantAccess = true });
        var body = await provision.Content.ReadFromJsonAsync<ProvisionResponse>();
        Assert.NotNull(body);
        Assert.NotNull(body.UserId);

        var del = await client.DeleteAsync($"/api/groups/{created.Id}/roster/{body.MemberId}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var roster = await client.GetFromJsonAsync<RosterResponse>($"/api/groups/{created.Id}/roster");
        Assert.DoesNotContain(roster!.Items, i => i.DisplayName == "Temp");

        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Null(await users.FindByIdAsync(body.UserId!.Value.ToString("D")));
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(
        WebApplicationFactory<Program> factory,
        string email,
        string password = "Password1")
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        await client.PostAsJsonAsync("/api/auth/register", new { email, password, displayName = email });
        await AuthTestHelper.ConfirmEmailAsync(factory.Services, email);
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password, rememberMe = false });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
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

    private sealed record GroupResponse(Guid Id, string Name, string? Slug);
    private sealed record RosterItem(Guid MemberId, Guid? UserId, string DisplayName, string Role, bool HasAccess);
    private sealed record RosterResponse(List<RosterItem> Items);
    private sealed record ProvisionResponse(Guid MemberId, Guid? UserId, string Credential, string? TemporaryPassword, bool Mailed);
}
