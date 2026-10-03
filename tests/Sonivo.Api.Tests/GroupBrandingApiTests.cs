using System.Net;
using System.Net.Http.Headers;
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

public class GroupBrandingApiTests : IClassFixture<SonivoApiFactory>, IClassFixture<GroupBrandingOffFactory>
{
    private readonly SonivoApiFactory _factory;
    private readonly GroupBrandingOffFactory _factoryOff;

    public GroupBrandingApiTests(SonivoApiFactory factory, GroupBrandingOffFactory factoryOff)
    {
        _factory = factory;
        _factoryOff = factoryOff;
    }

    [Fact]
    public async Task Owner_reads_empty_branding_then_updates_it()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "brand-owner@example.com");
        var group = await (await client.PostAsJsonAsync("/api/groups", new { name = "Brand Band" }))
            .Content.ReadFromJsonAsync<GroupDtoResponse>();
        Assert.NotNull(group);

        var initial = await client.GetFromJsonAsync<BrandingResponse>($"/api/groups/{group.Id}/branding");
        Assert.NotNull(initial);
        Assert.Equal(0, initial.Version);

        var update = await client.PutAsJsonAsync($"/api/groups/{group.Id}/branding", new
        {
            expectedVersion = 0,
            displayName = "Marca Propia",
            accentHex = "#5B4BD6",
            secondaryHex = "#F5C542",
            coverKind = "gradient",
            coverValue = "violeta",
            themeDefault = "dark",
            defaultLocale = "es",
            welcomeText = "Bienvenido",
            loginHeadline = "Entra a la banda",
            tagline = "Adorando juntos, sirviendo a Dios.",
            verse = "Salmo 150:6",
            showSonivoCredit = false
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await update.Content.ReadFromJsonAsync<BrandingResponse>();
        Assert.NotNull(updated);
        Assert.Equal("#5b4bd6", updated.AccentHex);
        Assert.Equal("#f5c542", updated.SecondaryHex);
        Assert.Equal("#ffffff", updated.OnPrimary);
        Assert.Equal("#0f172a", updated.OnSecondary);
        Assert.Equal("Adorando juntos, sirviendo a Dios.", updated.Tagline);
        Assert.Equal("Salmo 150:6", updated.Verse);
        Assert.Equal("Marca Propia", updated.DisplayName);
        Assert.False(updated.ShowSonivoCredit);
        Assert.Equal(2, updated.Version);
    }

    [Fact]
    public async Task Invalid_accent_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "brand-invalid@example.com");
        var group = await (await client.PostAsJsonAsync("/api/groups", new { name = "Invalid Band" }))
            .Content.ReadFromJsonAsync<GroupDtoResponse>();
        Assert.NotNull(group);

        var bad = await client.PutAsJsonAsync($"/api/groups/{group.Id}/branding", new
        {
            expectedVersion = 0,
            accentHex = "javascript:alert(1)"
        });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        var lowContrast = await client.PutAsJsonAsync($"/api/groups/{group.Id}/branding", new
        {
            expectedVersion = 0,
            accentHex = "#7a7a7a"
        });
        Assert.Equal(HttpStatusCode.BadRequest, lowContrast.StatusCode);

        var lowContrastSecondary = await client.PutAsJsonAsync($"/api/groups/{group.Id}/branding", new
        {
            expectedVersion = 0,
            secondaryHex = "#7a7a7a"
        });
        Assert.Equal(HttpStatusCode.BadRequest, lowContrastSecondary.StatusCode);
    }

    [Fact]
    public async Task Member_cannot_update_branding()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("brand-owner-m@example.com", "OwnerM1!", ownerId),
            ("brand-member-m@example.com", "MemberM1!", memberId),
            groupId);

        var member = await CreateAuthenticatedClientAsync(_factory, "brand-member-m@example.com", "MemberM1!");
        var response = await member.PutAsJsonAsync($"/api/groups/{groupId}/branding", new
        {
            expectedVersion = 0,
            displayName = "Hack"
        });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        // A member who is not in the group gets 404 (no existence leak).
        var stranger = await CreateAuthenticatedClientAsync(_factory, "brand-stranger@example.com");
        var strangerGet = await stranger.GetAsync($"/api/groups/{groupId}/branding");
        Assert.Equal(HttpStatusCode.NotFound, strangerGet.StatusCode);
    }

    [Fact]
    public async Task Logo_upload_enforces_type_allowlist_and_size_cap()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "brand-logo@example.com");
        var group = await (await client.PostAsJsonAsync("/api/groups", new { name = "Logo Band" }))
            .Content.ReadFromJsonAsync<GroupDtoResponse>();
        Assert.NotNull(group);

        using var text = new MultipartFormDataContent();
        var textPart = new ByteArrayContent([1, 2, 3]);
        textPart.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        text.Add(textPart, "file", "logo.txt");
        var rejected = await client.PostAsync($"/api/groups/{group.Id}/branding/logo", text);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);

        using var huge = new MultipartFormDataContent();
        var hugePart = new ByteArrayContent(new byte[2 * 1024 * 1024 + 1]);
        hugePart.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        huge.Add(hugePart, "file", "huge.png");
        var tooBig = await client.PostAsync($"/api/groups/{group.Id}/branding/logo", huge);
        Assert.Equal(HttpStatusCode.BadRequest, tooBig.StatusCode);

        using var png = new MultipartFormDataContent();
        var pngPart = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47]);
        pngPart.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        png.Add(pngPart, "file", "logo.png");
        var ok = await client.PostAsync($"/api/groups/{group.Id}/branding/logo", png);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var updated = await ok.Content.ReadFromJsonAsync<BrandingResponse>();
        Assert.NotNull(updated);
        Assert.True(updated.HasLogo);
    }

    [Fact]
    public async Task Banner_upload_enforces_type_allowlist_and_persists()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "brand-banner@example.com");
        var group = await (await client.PostAsJsonAsync("/api/groups", new { name = "Banner Band" }))
            .Content.ReadFromJsonAsync<GroupDtoResponse>();
        Assert.NotNull(group);

        using var text = new MultipartFormDataContent();
        var textPart = new ByteArrayContent([1, 2, 3]);
        textPart.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        text.Add(textPart, "file", "banner.txt");
        var rejected = await client.PostAsync($"/api/groups/{group.Id}/branding/banner", text);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);

        using var png = new MultipartFormDataContent();
        var pngPart = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47]);
        pngPart.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        png.Add(pngPart, "file", "banner.png");
        var ok = await client.PostAsync($"/api/groups/{group.Id}/branding/banner", png);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var updated = await ok.Content.ReadFromJsonAsync<BrandingResponse>();
        Assert.NotNull(updated);
        Assert.True(updated.HasBanner);
        Assert.NotNull(updated.BannerUrl);

        var fetched = await client.GetAsync($"/api/groups/{group.Id}/branding/banner");
        Assert.Equal(HttpStatusCode.OK, fetched.StatusCode);
    }

    [Fact]
    public async Task Public_branding_is_uniform_for_unknown_and_unbranded_groups()
    {
        var client = await CreateAuthenticatedClientAsync(_factory, "brand-public@example.com");
        var group = await (await client.PostAsJsonAsync("/api/groups", new { name = "Public Band" }))
            .Content.ReadFromJsonAsync<GroupDtoResponse>();
        Assert.NotNull(group);

        var anon = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var unknown = await anon.GetAsync("/api/groups/by-slug/definitely-not-a-group/branding");
        var unbranded = await anon.GetAsync($"/api/groups/by-slug/{group.Slug}/branding");

        Assert.Equal(HttpStatusCode.OK, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.OK, unbranded.StatusCode);
        // A group without an explicit display name is indistinguishable from an unknown slug.
        Assert.Null((await unknown.Content.ReadFromJsonAsync<PublicBrandingResponse>())!.Name);
        Assert.Null((await unbranded.Content.ReadFromJsonAsync<PublicBrandingResponse>())!.Name);
    }

    [Fact]
    public async Task Branding_endpoints_are_404_when_the_flag_is_off()
    {
        var client = await CreateAuthenticatedClientAsync(_factoryOff, "brand-off@example.com");
        var group = await (await client.PostAsJsonAsync("/api/groups", new { name = "Off Brand" }))
            .Content.ReadFromJsonAsync<GroupDtoResponse>();
        Assert.NotNull(group);

        var get = await client.GetAsync($"/api/groups/{group.Id}/branding");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);

        var put = await client.PutAsJsonAsync($"/api/groups/{group.Id}/branding", new { expectedVersion = 0 });
        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);

        var manifest = await client.GetAsync("/g/anything/manifest.webmanifest");
        Assert.Equal(HttpStatusCode.NotFound, manifest.StatusCode);
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

    private async Task SeedUsersAndMembershipAsync(
        (string Email, string Password, Guid Id) owner,
        (string Email, string Password, Guid Id) member,
        Guid groupId)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
        await EnsureUserAsync(users, owner.Email, owner.Password, owner.Id);
        await EnsureUserAsync(users, member.Email, member.Password, member.Id);

        var now = DateTimeOffset.UtcNow;
        if (!await db.Groups.IgnoreQueryFilters().AnyAsync(g => g.Id == groupId))
        {
            await db.Groups.AddAsync(Group.Create("Brand Shared", now, groupId));
            await db.Memberships.AddAsync(Membership.CreateOwner(groupId, owner.Id, now));
            await db.Memberships.AddAsync(Membership.CreateMember(groupId, member.Id, now));
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureUserAsync(UserManager<ApplicationUser> users, string email, string password, Guid id)
    {
        if (await users.FindByEmailAsync(email) is not null)
        {
            return;
        }

        var user = new ApplicationUser { Id = id, Email = email, UserName = email, DisplayName = email };
        var result = await users.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Description)));
        }
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

    private sealed record GroupDtoResponse(Guid Id, string Name, string? Slug);
    private sealed record BrandingResponse(
        Guid GroupId,
        string? DisplayName,
        string? AccentHex,
        string? SecondaryHex,
        string? OnPrimary,
        string? OnSecondary,
        string? CoverKind,
        string? CoverValue,
        string? Tagline,
        string? Verse,
        bool HasLogo,
        bool HasBanner,
        string? BannerUrl,
        bool ShowSonivoCredit,
        int Version);
    private sealed record PublicBrandingResponse(string? Name, string? LogoUrl, string? AccentHex, string? LoginHeadline);
}
