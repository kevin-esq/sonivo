using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sonivo.Api.Tests;

public class UsageApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public UsageApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Usage_reports_counts_against_the_plan_limits()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "usage-owner@example.com");

        var created = await client.PostAsJsonAsync("/api/groups", new { name = "Usage Band" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var group = await created.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(group);

        var usage = await client.GetFromJsonAsync<UsageResponse>($"/api/groups/{group.Id}/usage");
        Assert.NotNull(usage);
        Assert.Equal("studio", usage.PlanId);
        Assert.Equal(1, usage.Members.Used);
        Assert.Null(usage.Members.Limit); // Studio: unlimited
        Assert.Equal(0, usage.Songs.Used);
        Assert.Null(usage.Songs.Limit);
        Assert.Equal(0, usage.Setlists.Used);
        Assert.Equal(0, usage.EventsThisMonth.Used);
        Assert.Equal(0, usage.StorageBytes.Used);
        Assert.Equal(50L * 1024 * 1024 * 1024, usage.StorageBytes.Limit);
    }

    [Fact]
    public async Task Usage_requires_membership()
    {
        var owner = await CreateAuthenticatedClientAsync(_factory, "usage-owner2@example.com");
        var created = await owner.PostAsJsonAsync("/api/groups", new { name = "Private Usage" });
        var group = await created.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(group);

        var stranger = await CreateAuthenticatedClientAsync(_factory, "usage-stranger@example.com");
        var response = await stranger.GetAsync($"/api/groups/{group.Id}/usage");
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

    private sealed record GroupResponse(Guid Id, string Name);

    private sealed record UsageMetricResponse(long Used, long? Limit);

    private sealed record UsageResponse(
        string PlanId,
        UsageMetricResponse Members,
        UsageMetricResponse Songs,
        UsageMetricResponse Setlists,
        UsageMetricResponse EventsThisMonth,
        UsageMetricResponse StorageBytes);
}
