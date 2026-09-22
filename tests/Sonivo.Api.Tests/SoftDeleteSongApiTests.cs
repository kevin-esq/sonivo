using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

public class SoftDeleteSongApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public SoftDeleteSongApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_delete_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{Guid.NewGuid()}/songs/{Guid.NewGuid()}")
        {
            Content = JsonContent.Create(new { expectedVersion = 1 })
        });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_delete_cascades_and_hides_song_and_arrangements()
    {
        var client = await CreateAuthenticatedClientAsync("del-owner@example.com");
        var group = await CreateGroupAsync(client, "Delete Band");
        var song = await CreateSongAsync(client, group.Id, "To Delete");
        var arr = await CreateArrangementAsync(client, group.Id, song.Id, "Live");

        var delete = await client.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{group.Id}/songs/{song.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 1 })
        });
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/groups/{group.Id}/songs/{song.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/groups/{group.Id}/arrangements/{arr.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/groups/{group.Id}/songs/{song.Id}/arrangements")).StatusCode);
    }

    [Fact]
    public async Task Member_delete_returns_403()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("del-owner-c@example.com", "OwnerC1!", ownerId),
            ("del-member-c@example.com", "MemberC1!", memberId),
            groupId,
            "Shared Del",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("del-owner-c@example.com", "OwnerC1!");
        var song = await CreateSongAsync(ownerClient, groupId, "Shared Song");

        var memberClient = await CreateAuthenticatedClientAsync("del-member-c@example.com", "MemberC1!");
        var delete = await memberClient.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{groupId}/songs/{song.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 1 })
        });
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);
    }

    [Fact]
    public async Task Non_member_delete_returns_404()
    {
        var owner = await CreateAuthenticatedClientAsync("del-owner-b@example.com");
        var group = await CreateGroupAsync(owner, "Private Del");
        var song = await CreateSongAsync(owner, group.Id, "Hidden");

        var stranger = await CreateAuthenticatedClientAsync("del-stranger@example.com");
        var delete = await stranger.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{group.Id}/songs/{song.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 1 })
        });
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
    }

    [Fact]
    public async Task Missing_expected_version_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("del-missing@example.com");
        var group = await CreateGroupAsync(client, "Missing Ver");
        var song = await CreateSongAsync(client, group.Id, "Song");

        var delete = await client.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{group.Id}/songs/{song.Id}")
        {
            Content = JsonContent.Create(new { })
        });
        Assert.Equal(HttpStatusCode.BadRequest, delete.StatusCode);
    }

    [Fact]
    public async Task Stale_version_returns_409()
    {
        var client = await CreateAuthenticatedClientAsync("del-stale@example.com");
        var group = await CreateGroupAsync(client, "Stale Del");
        var song = await CreateSongAsync(client, group.Id, "Song");
        await CreateArrangementAsync(client, group.Id, song.Id, "Keep");

        var delete = await client.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{group.Id}/songs/{song.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 99 })
        });
        Assert.Equal(HttpStatusCode.Conflict, delete.StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await client.GetAsync($"/api/groups/{group.Id}/songs/{song.Id}")).StatusCode);
        var list = await client.GetFromJsonAsync<List<ArrangementListResponse>>(
            $"/api/groups/{group.Id}/songs/{song.Id}/arrangements");
        Assert.NotNull(list);
        Assert.Single(list);
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

    private static async Task<GroupResponse> CreateGroupAsync(HttpClient client, string name)
    {
        var create = await client.PostAsJsonAsync("/api/groups", new { name });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<GroupResponse>())
            ?? throw new InvalidOperationException("Missing group");
    }

    private static async Task<SongResponse> CreateSongAsync(HttpClient client, Guid groupId, string title)
    {
        var create = await client.PostAsJsonAsync($"/api/groups/{groupId}/songs", new
        {
            title,
            originKind = "original"
        });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<SongResponse>())
            ?? throw new InvalidOperationException("Missing song");
    }

    private static async Task<ArrangementResponse> CreateArrangementAsync(
        HttpClient client,
        Guid groupId,
        Guid songId,
        string label)
    {
        var create = await client.PostAsJsonAsync(
            $"/api/groups/{groupId}/songs/{songId}/arrangements",
            new { label });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<ArrangementResponse>())
            ?? throw new InvalidOperationException("Missing arrangement");
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
        if (await users.FindByEmailAsync(email) is not null)
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
    private sealed record SongResponse(Guid Id, string Title, int Version);
    private sealed record ArrangementResponse(Guid Id, Guid SongId, string Label, int Version);
    private sealed record ArrangementListResponse(Guid Id, Guid SongId, string Label, int Version);
}
