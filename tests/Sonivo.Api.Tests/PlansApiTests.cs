using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sonivo.Api.Tests;

public class PlansApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public PlansApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Plan_catalog_exposes_the_three_plans_and_default()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "plans-catalog@example.com");

        var catalog = await client.GetFromJsonAsync<PlanCatalogResponse>("/api/plans");

        Assert.NotNull(catalog);
        Assert.Equal("studio", catalog.DefaultPlanId);
        Assert.Equal(3, catalog.Plans.Count);
        Assert.Contains(catalog.Plans, p => p.Id == "starter");
        Assert.Contains(catalog.Plans, p => p.Id == "pro");
        Assert.Contains(catalog.Plans, p => p.Id == "studio");

        var starter = catalog.Plans.Single(p => p.Id == "starter");
        Assert.False(starter.Capabilities.Accent);
        Assert.False(starter.Capabilities.RemovePoweredBy);

        var studio = catalog.Plans.Single(p => p.Id == "studio");
        Assert.True(studio.Capabilities.Accent);
        Assert.True(studio.Capabilities.SplitColors);
        Assert.True(studio.Capabilities.RemovePoweredBy);
    }

    [Fact]
    public async Task Group_response_includes_effective_plan_and_capabilities()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "plans-group@example.com");

        var created = await client.PostAsJsonAsync("/api/groups", new { name = "Plan Band" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var group = await created.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(group);

        var fetched = await client.GetFromJsonAsync<GroupResponse>($"/api/groups/{group.Id}");
        Assert.NotNull(fetched);
        // Default plan keeps full brand capabilities so existing groups don't regress.
        Assert.Equal("studio", fetched.PlanId);
        Assert.True(fetched.Capabilities.Accent);
        Assert.True(fetched.Capabilities.RemovePoweredBy);
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

    private sealed record PlanCatalogResponse(string DefaultPlanId, List<PlanResponse> Plans);

    private sealed record PlanResponse(string Id, PlanCapabilities Capabilities);

    private sealed record PlanCapabilities(
        bool Themes,
        bool Accent,
        bool Intensity,
        bool Icon,
        bool SplitColors,
        bool GradientStyle,
        bool Font,
        bool BrandName,
        bool WelcomeText,
        bool LoginBranding,
        bool Logo,
        bool Banner,
        bool RemovePoweredBy);

    private sealed record GroupResponse(Guid Id, string Name, string PlanId, PlanCapabilities Capabilities);
}
