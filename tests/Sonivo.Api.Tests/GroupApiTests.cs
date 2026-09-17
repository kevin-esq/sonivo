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

public class GroupApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public GroupApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
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

    private sealed record GroupResponse(Guid Id, string Name, int Version, string? Role);
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
        builder.UseSetting("Resend:ApiKey", "");
        builder.UseSetting("Resend:From", "");
        builder.UseSetting("PublicOrigin", "");
    }
}
