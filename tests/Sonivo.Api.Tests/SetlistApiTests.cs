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

public class SetlistApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public SetlistApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_setlist_list_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync($"/api/groups/{Guid.NewGuid()}/setlists");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_can_create_rename_and_replace_ordered_items()
    {
        var client = await CreateAuthenticatedClientAsync("setlist-owner@example.com");
        var group = await CreateGroupAsync(client, "Setlist Band");

        var song = await CreateSongAsync(client, group.Id, "Grace");
        var arrA = await CreateArrangementAsync(client, group.Id, song.Id, "Acoustic");
        var arrB = await CreateArrangementAsync(client, group.Id, song.Id, "Full Band");

        var create = await client.PostAsJsonAsync($"/api/groups/{group.Id}/setlists", new { name = "Sunday" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(created);
        Assert.Equal("Sunday", created.Name);
        Assert.Equal(1, created.Version);
        Assert.Empty(created.Items);

        var replace = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/setlists/{created.Id}/items",
            new
            {
                expectedVersion = 1,
                items = new[]
                {
                    new { arrangementId = arrB.Id, sortOrder = 2 },
                    new { arrangementId = arrA.Id, sortOrder = 1 },
                    new { arrangementId = arrA.Id, sortOrder = 3 }
                }
            });
        Assert.Equal(HttpStatusCode.OK, replace.StatusCode);
        var composed = await replace.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(composed);
        Assert.Equal(2, composed.Version);
        Assert.Equal(3, composed.Items.Count);
        Assert.Equal(arrA.Id, composed.Items[0].ArrangementId);
        Assert.Equal(1, composed.Items[0].SortOrder);
        Assert.Equal("Grace", composed.Items[0].SongTitle);
        Assert.Equal("Acoustic", composed.Items[0].ArrangementLabel);
        Assert.Equal(arrB.Id, composed.Items[1].ArrangementId);
        Assert.Equal(arrA.Id, composed.Items[2].ArrangementId);

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/setlists/{created.Id}",
            new { name = "Sunday AM", expectedVersion = 2 });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var renamed = await patch.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(renamed);
        Assert.Equal("Sunday AM", renamed.Name);
        Assert.Equal(3, renamed.Version);

        var list = await client.GetFromJsonAsync<List<SetlistListResponse>>(
            $"/api/groups/{group.Id}/setlists",
            JsonOptions);
        Assert.NotNull(list);
        Assert.Contains(list, s => s.Id == created.Id && s.ItemCount == 3);
    }

    [Fact]
    public async Task Soft_deleted_arrangement_cannot_be_added()
    {
        var client = await CreateAuthenticatedClientAsync("setlist-softdel@example.com");
        var group = await CreateGroupAsync(client, "Soft Band");
        var song = await CreateSongAsync(client, group.Id, "Song");
        var arr = await CreateArrangementAsync(client, group.Id, song.Id, "Live");

        var deleteArr = await client.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{group.Id}/arrangements/{arr.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 1 })
        });
        Assert.Equal(HttpStatusCode.NoContent, deleteArr.StatusCode);

        var create = await client.PostAsJsonAsync($"/api/groups/{group.Id}/setlists", new { name = "Set" });
        var created = await create.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(created);

        var replace = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/setlists/{created.Id}/items",
            new
            {
                expectedVersion = 1,
                items = new[] { new { arrangementId = arr.Id, sortOrder = 1 } }
            });
        Assert.Equal(HttpStatusCode.BadRequest, replace.StatusCode);
    }

    [Fact]
    public async Task Member_can_read_but_not_mutate()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("setlist-o@example.com", "Password1", ownerId),
            ("setlist-m@example.com", "Password1", memberId),
            groupId,
            "Shared",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("setlist-o@example.com");
        var song = await CreateSongAsync(ownerClient, groupId, "Shared Song");
        var arr = await CreateArrangementAsync(ownerClient, groupId, song.Id, "Main");
        var create = await ownerClient.PostAsJsonAsync($"/api/groups/{groupId}/setlists", new { name = "Shared Set" });
        var created = await create.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(created);
        await ownerClient.PutAsJsonAsync(
            $"/api/groups/{groupId}/setlists/{created.Id}/items",
            new
            {
                expectedVersion = 1,
                items = new[] { new { arrangementId = arr.Id, sortOrder = 1 } }
            });

        var memberClient = await CreateAuthenticatedClientAsync("setlist-m@example.com");
        var get = await memberClient.GetAsync($"/api/groups/{groupId}/setlists/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);

        var mutate = await memberClient.PostAsJsonAsync($"/api/groups/{groupId}/setlists", new { name = "Hack" });
        Assert.Equal(HttpStatusCode.Forbidden, mutate.StatusCode);
    }

    [Fact]
    public async Task Non_member_get_returns_404()
    {
        var ownerClient = await CreateAuthenticatedClientAsync("setlist-priv@example.com");
        var group = await CreateGroupAsync(ownerClient, "Private");
        var create = await ownerClient.PostAsJsonAsync($"/api/groups/{group.Id}/setlists", new { name = "Hidden" });
        var created = await create.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(created);

        var stranger = await CreateAuthenticatedClientAsync("setlist-stranger@example.com");
        var get = await stranger.GetAsync($"/api/groups/{group.Id}/setlists/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
    }

    [Fact]
    public async Task Stale_expected_version_returns_409()
    {
        var client = await CreateAuthenticatedClientAsync("setlist-409@example.com");
        var group = await CreateGroupAsync(client, "Conflict Band");
        var create = await client.PostAsJsonAsync($"/api/groups/{group.Id}/setlists", new { name = "Set" });
        var created = await create.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(created);

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/setlists/{created.Id}",
            new { name = "Nope", expectedVersion = 99 });
        Assert.Equal(HttpStatusCode.Conflict, patch.StatusCode);
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

    private static async Task<GroupResponse> CreateGroupAsync(HttpClient client, string name)
    {
        var create = await client.PostAsJsonAsync("/api/groups", new { name });
        create.EnsureSuccessStatusCode();
        var group = await create.Content.ReadFromJsonAsync<GroupResponse>(JsonOptions);
        return group ?? throw new InvalidOperationException("Missing group response");
    }

    private static async Task<SongDetailResponse> CreateSongAsync(HttpClient client, Guid groupId, string title)
    {
        var create = await client.PostAsJsonAsync($"/api/groups/{groupId}/songs", new
        {
            title,
            originKind = "original"
        });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<SongDetailResponse>(JsonOptions))!;
    }

    private static async Task<ArrangementDetailResponse> CreateArrangementAsync(
        HttpClient client,
        Guid groupId,
        Guid songId,
        string label)
    {
        var create = await client.PostAsJsonAsync(
            $"/api/groups/{groupId}/songs/{songId}/arrangements",
            new { label });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<ArrangementDetailResponse>(JsonOptions))!;
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
        var payload = await response.Content.ReadFromJsonAsync<CsrfResponse>(JsonOptions);
        if (payload?.Token is null)
        {
            throw new InvalidOperationException("Missing CSRF token");
        }

        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload.Token);
    }

    private sealed record CsrfResponse(string Token);
    private sealed record GroupResponse(Guid Id, string Name, int Version);
    private sealed record SongDetailResponse(Guid Id, string Title, int Version);
    private sealed record ArrangementDetailResponse(Guid Id, Guid SongId, string Label, int Version);
    private sealed record SetlistListResponse(Guid Id, string Name, int Version, int ItemCount);
    private sealed record SetlistDetailResponse(
        Guid Id,
        string Name,
        int Version,
        List<SetlistItemResponse> Items);
    private sealed record SetlistItemResponse(
        Guid Id,
        Guid ArrangementId,
        int SortOrder,
        string? SongTitle,
        string? ArrangementLabel);
}
