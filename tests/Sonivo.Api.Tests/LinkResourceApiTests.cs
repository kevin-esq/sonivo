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

public class LinkResourceApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public LinkResourceApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_list_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync(
            $"/api/groups/{Guid.NewGuid()}/arrangements/{Guid.NewGuid()}/resources");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_crud_flow_succeeds()
    {
        var client = await CreateAuthenticatedClientAsync("res-owner@example.com");
        var (_, arrangementId) = await SeedSongAndArrangementAsync(client, "Res Band");

        var create = await client.PostAsJsonAsync(
            $"/api/groups/{arrangementId.GroupId}/arrangements/{arrangementId.Id}/resources",
            new
            {
                kind = "link",
                purpose = "practice",
                label = "Backing track",
                part = "Drums",
                note = "slow",
                url = "https://example.com/track"
            });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<ResourceResponse>();
        Assert.NotNull(created);
        Assert.Equal("link", created.Kind);
        Assert.Equal("https://example.com/track", created.Url);

        var list = await client.GetFromJsonAsync<List<ResourceResponse>>(
            $"/api/groups/{arrangementId.GroupId}/arrangements/{arrangementId.Id}/resources");
        Assert.NotNull(list);
        Assert.Single(list);

        var get = await client.GetAsync(
            $"/api/groups/{arrangementId.GroupId}/arrangements/{arrangementId.Id}/resources/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{arrangementId.GroupId}/arrangements/{arrangementId.Id}/resources/{created.Id}",
            new { label = "Updated track", purpose = "audio" });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var updated = await patch.Content.ReadFromJsonAsync<ResourceResponse>();
        Assert.NotNull(updated);
        Assert.Equal("Updated track", updated.Label);

        var delete = await client.DeleteAsync(
            $"/api/groups/{arrangementId.GroupId}/arrangements/{arrangementId.Id}/resources/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync(
                $"/api/groups/{arrangementId.GroupId}/arrangements/{arrangementId.Id}/resources/{created.Id}"))
            .StatusCode);
    }

    [Fact]
    public async Task File_kind_and_validation_failures_return_400()
    {
        var client = await CreateAuthenticatedClientAsync("res-val@example.com");
        var (_, arrangementId) = await SeedSongAndArrangementAsync(client, "Val Band");
        var basePath = $"/api/groups/{arrangementId.GroupId}/arrangements/{arrangementId.Id}/resources";

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(basePath, new
            {
                kind = "file",
                purpose = "practice",
                label = "X",
                url = "https://example.com"
            })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(basePath, new
            {
                kind = "link",
                purpose = "stems",
                label = "X",
                url = "https://example.com"
            })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(basePath, new
            {
                kind = "link",
                purpose = "other",
                label = "  ",
                url = "https://example.com"
            })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(basePath, new
            {
                kind = "link",
                purpose = "other",
                label = "X",
                url = "  "
            })).StatusCode);
    }

    [Fact]
    public async Task Member_mutation_returns_403_and_non_member_404()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("res-owner-c@example.com", "OwnerC1!", ownerId),
            ("res-member-c@example.com", "MemberC1!", memberId),
            groupId,
            "Shared Res",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("res-owner-c@example.com", "OwnerC1!");
        var song = await CreateSongAsync(ownerClient, groupId, "Song");
        var arr = await CreateArrangementAsync(ownerClient, groupId, song.Id, "Arr");
        var create = await ownerClient.PostAsJsonAsync(
            $"/api/groups/{groupId}/arrangements/{arr.Id}/resources",
            new { kind = "link", purpose = "other", label = "L", url = "https://example.com" });
        var resource = await create.Content.ReadFromJsonAsync<ResourceResponse>();
        Assert.NotNull(resource);

        var memberClient = await CreateAuthenticatedClientAsync("res-member-c@example.com", "MemberC1!");
        Assert.Equal(HttpStatusCode.OK,
            (await memberClient.GetAsync($"/api/groups/{groupId}/arrangements/{arr.Id}/resources")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PostAsJsonAsync(
                $"/api/groups/{groupId}/arrangements/{arr.Id}/resources",
                new { kind = "link", purpose = "other", label = "M", url = "https://example.com" })).StatusCode);

        var stranger = await CreateAuthenticatedClientAsync("res-stranger@example.com");
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync($"/api/groups/{groupId}/arrangements/{arr.Id}/resources")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync(
                $"/api/groups/{groupId}/arrangements/{arr.Id}/resources/{resource.Id}")).StatusCode);
    }

    [Fact]
    public async Task Soft_deleted_arrangement_resource_routes_return_404()
    {
        var client = await CreateAuthenticatedClientAsync("res-del-arr@example.com");
        var (groupId, arrangementId) = await SeedSongAndArrangementAsync(client, "Del Arr Band");
        await client.PostAsJsonAsync(
            $"/api/groups/{groupId}/arrangements/{arrangementId.Id}/resources",
            new { kind = "link", purpose = "other", label = "L", url = "https://example.com" });

        var deleteArr = await client.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{groupId}/arrangements/{arrangementId.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 1 })
        });
        Assert.Equal(HttpStatusCode.NoContent, deleteArr.StatusCode);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/groups/{groupId}/arrangements/{arrangementId.Id}/resources")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(
                $"/api/groups/{groupId}/arrangements/{arrangementId.Id}/resources",
                new { kind = "link", purpose = "other", label = "L", url = "https://example.com" })).StatusCode);
    }

    private async Task<(Guid GroupId, ArrangementIds Arrangement)> SeedSongAndArrangementAsync(
        HttpClient client,
        string groupName)
    {
        var group = await CreateGroupAsync(client, groupName);
        var song = await CreateSongAsync(client, group.Id, "Song");
        var arr = await CreateArrangementAsync(client, group.Id, song.Id, "Acoustic");
        return (group.Id, new ArrangementIds(group.Id, arr.Id));
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
            throw new InvalidOperationException(await register.Content.ReadAsStringAsync());
        }

        // T-AU-01: mailbox must be proven before the login gate passes.
        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);
        await EnsureCsrfAsync(client);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/auth/login", new { email, password, rememberMe = false })).StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private static async Task<GroupResponse> CreateGroupAsync(HttpClient client, string name)
    {
        var create = await client.PostAsJsonAsync("/api/groups", new { name });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<GroupResponse>())!;
    }

    private static async Task<SongResponse> CreateSongAsync(HttpClient client, Guid groupId, string title)
    {
        var create = await client.PostAsJsonAsync($"/api/groups/{groupId}/songs", new
        {
            title,
            originKind = "original"
        });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<SongResponse>())!;
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
        return (await create.Content.ReadFromJsonAsync<ArrangementResponse>())!;
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

        var result = await users.CreateAsync(new ApplicationUser
        {
            Id = id,
            Email = email,
            UserName = email,
            DisplayName = email
        }, password);
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
        var token = doc.RootElement.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private sealed record ArrangementIds(Guid GroupId, Guid Id);
    private sealed record GroupResponse(Guid Id, string Name);
    private sealed record SongResponse(Guid Id, string Title);
    private sealed record ArrangementResponse(Guid Id, Guid SongId, string Label);
    private sealed record ResourceResponse(
        Guid Id,
        Guid ArrangementId,
        string Kind,
        string Purpose,
        string Label,
        string? Url);
}
