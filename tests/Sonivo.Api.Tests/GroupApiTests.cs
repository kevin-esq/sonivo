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

public class GroupApiTests : IClassFixture<SonivoApiFactory>, IClassFixture<GroupBrandingOffFactory>
{
    private readonly SonivoApiFactory _factory;
    private readonly GroupBrandingOffFactory _factoryOff;

    public GroupApiTests(SonivoApiFactory factory, GroupBrandingOffFactory factoryOff)
    {
        _factory = factory;
        _factoryOff = factoryOff;
    }

    [Fact]
    public async Task Anonymous_group_list_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/api/groups");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_and_get_group_as_owner()
    {
        var client = await CreateAuthenticatedClientAsync("owner-a@example.com");
        var create = await client.PostAsJsonAsync("/api/groups", new { name = "Night Owls" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);
        Assert.Equal("Night Owls", created.Name);
        Assert.Equal(1, created.Version);
        Assert.Equal(MembershipRoles.Owner, created.Role);

        var get = await client.GetAsync($"/api/groups/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
    }

    [Fact]
    public async Task Non_member_get_returns_404()
    {
        var ownerClient = await CreateAuthenticatedClientAsync("owner-b@example.com");
        var create = await ownerClient.PostAsJsonAsync("/api/groups", new { name = "Owner Band" });
        var created = await create.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var stranger = await CreateAuthenticatedClientAsync("stranger@example.com");
        var get = await stranger.GetAsync($"/api/groups/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
    }

    [Fact]
    public async Task Member_rename_returns_403()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();

        await SeedUsersAndMembershipAsync(
            ("owner-c@example.com", "OwnerC1!", ownerId),
            ("member-c@example.com", "MemberC1!", memberId),
            groupId,
            "Shared",
            ownerId,
            memberId);

        var memberClient = await CreateAuthenticatedClientAsync("member-c@example.com", "MemberC1!");
        var patch = await memberClient.PatchAsJsonAsync(
            $"/api/groups/{groupId}",
            new { name = "Hacked", expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.Forbidden, patch.StatusCode);
    }

    [Fact]
    public async Task Stale_version_returns_409()
    {
        var client = await CreateAuthenticatedClientAsync("owner-d@example.com");
        var create = await client.PostAsJsonAsync("/api/groups", new { name = "Versioned" });
        var created = await create.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{created.Id}",
            new { name = "Nope", expectedVersion = 99 });
        Assert.Equal(HttpStatusCode.Conflict, patch.StatusCode);
    }

    [Fact]
    public async Task Mutating_without_csrf_returns_400()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        // Authenticate via password sign-in path that still requires CSRF in middleware
        await EnsureCsrfAsync(client);
        // Clear CSRF header by using a fresh request without header after eating token cookie only...
        // Register without header should fail CSRF first.
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "nocsrf@example.com",
            password = "Password1"
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Soft_deleted_group_unavailable()
    {
        var client = await CreateAuthenticatedClientAsync("owner-e@example.com");
        var create = await client.PostAsJsonAsync("/api/groups", new { name = "Temp" });
        var created = await create.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var delete = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, $"/api/groups/{created.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 1 })
        });
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        var get = await client.GetAsync($"/api/groups/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);

        var list = await client.GetFromJsonAsync<List<GroupListResponse>>("/api/groups");
        Assert.NotNull(list);
        Assert.DoesNotContain(list, g => g.Id == created.Id);
    }

    [Fact]
    public async Task Blank_create_name_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("owner-f@example.com");
        var create = await client.PostAsJsonAsync("/api/groups", new { name = "   " });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
    }

    [Fact]
    public async Task Create_returns_slug_and_by_slug_resolves_for_member()
    {
        var client = await CreateAuthenticatedClientAsync("slug-owner@example.com");
        var create = await client.PostAsJsonAsync("/api/groups", new { name = "White Label Band" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);
        Assert.Equal("white-label-band", created.Slug);

        var bySlug = await client.GetAsync($"/api/groups/by-slug/{created.Slug}");
        Assert.Equal(HttpStatusCode.OK, bySlug.StatusCode);
        var resolved = await bySlug.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(resolved);
        Assert.Equal(created.Id, resolved.Id);
    }

    [Fact]
    public async Task By_slug_is_404_for_non_member_and_for_unknown_slug()
    {
        var owner = await CreateAuthenticatedClientAsync("slug-owner2@example.com");
        var create = await owner.PostAsJsonAsync("/api/groups", new { name = "Hidden Band" });
        var created = await create.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var stranger = await CreateAuthenticatedClientAsync("slug-stranger@example.com");
        var asStranger = await stranger.GetAsync($"/api/groups/by-slug/{created.Slug}");
        Assert.Equal(HttpStatusCode.NotFound, asStranger.StatusCode);

        // Same response for an unknown slug: no enumeration.
        var unknown = await stranger.GetAsync("/api/groups/by-slug/does-not-exist-xyz");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Fact]
    public async Task Duplicate_names_receive_distinct_slugs()
    {
        var client = await CreateAuthenticatedClientAsync("slug-dup@example.com");
        var first = await (await client.PostAsJsonAsync("/api/groups", new { name = "Eco" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        var second = await (await client.PostAsJsonAsync("/api/groups", new { name = "Eco" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.NotEqual(first.Slug, second.Slug);
        Assert.StartsWith("eco", first.Slug);
        Assert.StartsWith("eco", second.Slug);
    }

    [Fact]
    public async Task By_slug_is_anonymous_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/api/groups/by-slug/night-owls");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_changes_slug_once_and_old_slug_redirects()
    {
        var client = await CreateAuthenticatedClientAsync("slug-change@example.com");
        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Cambio Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);
        var original = created.Slug!;

        var change = await client.PutAsJsonAsync($"/api/groups/{created.Id}/slug", new { slug = "mi-banda" });
        Assert.Equal(HttpStatusCode.OK, change.StatusCode);
        var updated = await change.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(updated);
        Assert.Equal("mi-banda", updated.Slug);

        // The previous slug still resolves to the group and is marked as moved.
        var old = await client.GetFromJsonAsync<GroupBySlugResponse>($"/api/groups/by-slug/{original}");
        Assert.NotNull(old);
        Assert.Equal(created.Id, old.Id);
        Assert.Equal("mi-banda", old.Slug);
        Assert.True(old.Moved);

        var current = await client.GetFromJsonAsync<GroupBySlugResponse>("/api/groups/by-slug/mi-banda");
        Assert.NotNull(current);
        Assert.False(current.Moved);

        // The change is allowed only once.
        var second = await client.PutAsJsonAsync($"/api/groups/{created.Id}/slug", new { slug = "otra-vez" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task A_foreign_group_cannot_claim_a_previous_slug()
    {
        var ownerA = await CreateAuthenticatedClientAsync("slug-a@example.com");
        var a = await (await ownerA.PostAsJsonAsync("/api/groups", new { name = "Alfa Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(a);
        var previousSlug = a.Slug!;
        var changeA = await ownerA.PutAsJsonAsync($"/api/groups/{a.Id}/slug", new { slug = "alfa-nueva" });
        Assert.Equal(HttpStatusCode.OK, changeA.StatusCode);

        var ownerB = await CreateAuthenticatedClientAsync("slug-b@example.com");
        var b = await (await ownerB.PostAsJsonAsync("/api/groups", new { name = "Beta Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(b);
        var claim = await ownerB.PutAsJsonAsync($"/api/groups/{b.Id}/slug", new { slug = previousSlug });
        Assert.Equal(HttpStatusCode.Conflict, claim.StatusCode);
    }

    [Fact]
    public async Task Slug_change_rejects_reserved_and_invalid()
    {
        var client = await CreateAuthenticatedClientAsync("slug-invalid@example.com");
        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Valid Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var reserved = await client.PutAsJsonAsync($"/api/groups/{created.Id}/slug", new { slug = "admin" });
        Assert.Equal(HttpStatusCode.BadRequest, reserved.StatusCode);

        var invalid = await client.PutAsJsonAsync($"/api/groups/{created.Id}/slug", new { slug = "a..b" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        // Unchanged slug is rejected and does not consume the one allowed change.
        var same = await client.PutAsJsonAsync($"/api/groups/{created.Id}/slug", new { slug = created.Slug });
        Assert.Equal(HttpStatusCode.BadRequest, same.StatusCode);

        var ok = await client.PutAsJsonAsync($"/api/groups/{created.Id}/slug", new { slug = "valid-band-2" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task Member_cannot_change_slug()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("slug-owner-d@example.com", "OwnerD1!", ownerId),
            ("slug-member-d@example.com", "MemberD1!", memberId),
            groupId,
            "Shared Slug",
            ownerId,
            memberId);

        var member = await CreateAuthenticatedClientAsync("slug-member-d@example.com", "MemberD1!");
        var response = await member.PutAsJsonAsync($"/api/groups/{groupId}/slug", new { slug = "hijack" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Slug_change_is_404_when_the_flag_is_off()
    {
        var client = _factoryOff.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);

        var email = $"slug-off-{Guid.NewGuid():N}@example.com";
        var register = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password1", displayName = email });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);
        await AuthTestHelper.ConfirmEmailAsync(_factoryOff.Services, email);
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Password1", rememberMe = false });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);

        var created = await (await client.PostAsJsonAsync("/api/groups", new { name = "Off Band" }))
            .Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(created);

        var response = await client.PutAsJsonAsync($"/api/groups/{created.Id}/slug", new { slug = "no-permitido" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password = "Password1")
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

        // T-AU-01: mailbox must be proven before the login gate passes.
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

    private async Task SeedUsersAndMembershipAsync(
        (string Email, string Password, Guid Id) owner,
        (string Email, string Password, Guid Id) member,
        Guid groupId,
        string groupName,
        Guid ownerId,
        Guid memberId)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();

        await EnsureUserAsync(users, owner.Email, owner.Password, owner.Id);
        await EnsureUserAsync(users, member.Email, member.Password, member.Id);

        var now = DateTimeOffset.UtcNow;
        if (!await db.Groups.IgnoreQueryFilters().AnyAsync(g => g.Id == groupId))
        {
            await db.Groups.AddAsync(Group.Create(groupName, now, groupId));
            await db.Memberships.AddAsync(Membership.CreateOwner(groupId, ownerId, now));
            await db.Memberships.AddAsync(Membership.CreateMember(groupId, memberId, now));
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureUserAsync(
        UserManager<ApplicationUser> users,
        string email,
        string password,
        Guid id)
    {
        var existing = await users.FindByEmailAsync(email);
        if (existing is not null)
        {
            return;
        }

        var user = new ApplicationUser
        {
            Id = id,
            Email = email,
            UserName = email,
            DisplayName = email
        };
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

    private sealed record GroupResponse(Guid Id, string Name, string? Slug, int Version, string? Role);
    private sealed record GroupBySlugResponse(Guid Id, string Name, string? Slug, bool Moved, int Version, string? Role);
    private sealed record GroupListResponse(Guid Id, string Name, string Role, int Version);
}

public sealed class SonivoApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"sonivo-api-{Guid.NewGuid()}";

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
        builder.UseSetting("Authentication:Google:ClientId", "");
        builder.UseSetting("Authentication:Google:ClientSecret", "");
        builder.UseSetting("Authentication:Google:EnableTestHook", "false");
        // Phase 4.3: the slug-change endpoint is behind this flag; the API tests
        // exercise it enabled. A dedicated factory keeps the off case covered.
        builder.UseSetting("Features:GroupBranding", "true");
        // Hermetic blob backend: ambient R2__* creds must never leak into tests.
        builder.UseSetting("R2:AccountId", "");
        builder.UseSetting("R2:AccessKey", "");
        builder.UseSetting("R2:Secret", "");
        builder.UseSetting("R2:BucketName", "");
    }
}

/// <summary>Phase 4.3 flag-off factory: the slug-change endpoint must 404.</summary>
public sealed class GroupBrandingOffFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"sonivo-api-branding-off-{Guid.NewGuid()}";

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
        builder.UseSetting("Authentication:Google:ClientId", "");
        builder.UseSetting("Authentication:Google:ClientSecret", "");
        builder.UseSetting("Authentication:Google:EnableTestHook", "false");
        builder.UseSetting("Features:GroupBranding", "false");
        builder.UseSetting("R2:AccountId", "");
        builder.UseSetting("R2:AccessKey", "");
        builder.UseSetting("R2:Secret", "");
        builder.UseSetting("R2:BucketName", "");
    }
}
