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
}
