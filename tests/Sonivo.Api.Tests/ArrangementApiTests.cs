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

public class ArrangementApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public ArrangementApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_arrangement_list_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync(
            $"/api/groups/{Guid.NewGuid()}/songs/{Guid.NewGuid()}/arrangements");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_can_create_list_get_update_and_soft_delete()
    {
        var client = await CreateAuthenticatedClientAsync("arr-owner@example.com");
        var group = await CreateGroupAsync(client, "Arr Band");
        var song = await CreateSongAsync(client, group.Id, "Amazing Grace");

        var create = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{song.Id}/arrangements",
            new { label = "Acoustic", defaultKey = "G", defaultBpm = 110, lyrics = "verse" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(created);
        Assert.Equal("Acoustic", created.Label);
        Assert.Equal(song.Id, created.SongId);
        Assert.Equal(1, created.Version);
        Assert.Empty(created.Resources);

        var list = await client.GetFromJsonAsync<List<ArrangementListResponse>>(
            $"/api/groups/{group.Id}/songs/{song.Id}/arrangements");
        Assert.NotNull(list);
        Assert.Contains(list, a => a.Id == created.Id);

        var get = await client.GetAsync($"/api/groups/{group.Id}/arrangements/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{created.Id}",
            new { label = "Studio", expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var updated = await patch.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(updated);
        Assert.Equal("Studio", updated.Label);
        Assert.Equal(2, updated.Version);

        var delete = await client.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{group.Id}/arrangements/{created.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 2 })
        });
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/groups/{group.Id}/arrangements/{created.Id}")).StatusCode);
    }

    [Fact]
    public async Task Non_member_returns_404()
    {
        var owner = await CreateAuthenticatedClientAsync("arr-owner-b@example.com");
        var group = await CreateGroupAsync(owner, "Private Arr");
        var song = await CreateSongAsync(owner, group.Id, "Song");
        var create = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{song.Id}/arrangements",
            new { label = "Hidden" });
        var arr = await create.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(arr);

        var stranger = await CreateAuthenticatedClientAsync("arr-stranger@example.com");
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync($"/api/groups/{group.Id}/songs/{song.Id}/arrangements")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync($"/api/groups/{group.Id}/arrangements/{arr.Id}")).StatusCode);
    }

    [Fact]
    public async Task Member_mutations_return_403()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();

        await SeedUsersAndMembershipAsync(
            ("arr-owner-c@example.com", "OwnerC1!", ownerId),
            ("arr-member-c@example.com", "MemberC1!", memberId),
            groupId,
            "Shared Arr",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("arr-owner-c@example.com", "OwnerC1!");
        var song = await CreateSongAsync(ownerClient, groupId, "Shared Song");
        var create = await ownerClient.PostAsJsonAsync(
            $"/api/groups/{groupId}/songs/{song.Id}/arrangements",
            new { label = "Owned" });
        var arr = await create.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(arr);

        var memberClient = await CreateAuthenticatedClientAsync("arr-member-c@example.com", "MemberC1!");
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PostAsJsonAsync(
                $"/api/groups/{groupId}/songs/{song.Id}/arrangements",
                new { label = "Member Arr" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PatchAsJsonAsync(
                $"/api/groups/{groupId}/arrangements/{arr.Id}",
                new { label = "Hacked", expectedVersion = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await memberClient.GetAsync($"/api/groups/{groupId}/arrangements/{arr.Id}")).StatusCode);
    }

    [Fact]
    public async Task Blank_label_and_invalid_bpm_return_400()
    {
        var client = await CreateAuthenticatedClientAsync("arr-val@example.com");
        var group = await CreateGroupAsync(client, "Val Band");
        var song = await CreateSongAsync(client, group.Id, "Song");

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(
                $"/api/groups/{group.Id}/songs/{song.Id}/arrangements",
                new { label = "   " })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(
                $"/api/groups/{group.Id}/songs/{song.Id}/arrangements",
                new { label = "Live", defaultBpm = 401 })).StatusCode);
    }

    [Fact]
    public async Task Stale_version_returns_409()
    {
        var client = await CreateAuthenticatedClientAsync("arr-conflict@example.com");
        var group = await CreateGroupAsync(client, "Conflict Arr");
        var song = await CreateSongAsync(client, group.Id, "Song");
        var create = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{song.Id}/arrangements",
            new { label = "Versioned" });
        var arr = await create.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(arr);

        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PatchAsJsonAsync(
                $"/api/groups/{group.Id}/arrangements/{arr.Id}",
                new { label = "Nope", expectedVersion = 99 })).StatusCode);

        var delete = await client.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{group.Id}/arrangements/{arr.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 99 })
        });
        Assert.Equal(HttpStatusCode.Conflict, delete.StatusCode);
    }

    [Fact]
    public async Task Owner_can_patch_and_get_chord_timing_json_member_read_ok_write_403()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();

        await SeedUsersAndMembershipAsync(
            ("arr-sync-owner@example.com", "OwnerSync1!", ownerId),
            ("arr-sync-member@example.com", "MemberSync1!", memberId),
            groupId,
            "Sync Arr",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("arr-sync-owner@example.com", "OwnerSync1!");
        var song = await CreateSongAsync(ownerClient, groupId, "Sync Song");
        var create = await ownerClient.PostAsJsonAsync(
            $"/api/groups/{groupId}/songs/{song.Id}/arrangements",
            new { label = "Timed" });
        var arr = await create.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(arr);
        Assert.Null(arr.ChordTimingJson);

        var marks = """[{"lineIndex":0,"atMs":1200},{"lineIndex":1,"atMs":3400}]""";
        var patch = await ownerClient.PatchAsJsonAsync(
            $"/api/groups/{groupId}/arrangements/{arr.Id}",
            new { chordTimingJson = marks, expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var updated = await patch.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(updated);
        Assert.Equal(2, updated.Version);
        Assert.Equal(marks, updated.ChordTimingJson);

        var memberClient = await CreateAuthenticatedClientAsync("arr-sync-member@example.com", "MemberSync1!");
        var memberGet = await memberClient.GetAsync($"/api/groups/{groupId}/arrangements/{arr.Id}");
        Assert.Equal(HttpStatusCode.OK, memberGet.StatusCode);
        var memberDetail = await memberGet.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(memberDetail);
        Assert.Equal(marks, memberDetail.ChordTimingJson);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PatchAsJsonAsync(
                $"/api/groups/{groupId}/arrangements/{arr.Id}",
                new { chordTimingJson = "[]", expectedVersion = 2 })).StatusCode);

        var clear = await ownerClient.PatchAsJsonAsync(
            $"/api/groups/{groupId}/arrangements/{arr.Id}",
            new { chordTimingJson = "[]", expectedVersion = 2 });
        Assert.Equal(HttpStatusCode.OK, clear.StatusCode);
        var cleared = await clear.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(cleared);
        Assert.Null(cleared.ChordTimingJson);
        Assert.Equal(3, cleared.Version);
    }

    [Fact]
    public async Task Malformed_chord_timing_json_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("arr-sync-val@example.com");
        var group = await CreateGroupAsync(client, "Sync Val");
        var song = await CreateSongAsync(client, group.Id, "Song");
        var create = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{song.Id}/arrangements",
            new { label = "Bad timing" });
        var arr = await create.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(arr);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync(
                $"/api/groups/{group.Id}/arrangements/{arr.Id}",
                new { chordTimingJson = """{"not":"array"}""", expectedVersion = 1 })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync(
                $"/api/groups/{group.Id}/arrangements/{arr.Id}",
                new { chordTimingJson = """[{"lineIndex":-1,"atMs":0}]""", expectedVersion = 1 })).StatusCode);
    }

    [Fact]
    public async Task Stale_version_on_chord_timing_patch_returns_409()
    {
        var client = await CreateAuthenticatedClientAsync("arr-sync-conflict@example.com");
        var group = await CreateGroupAsync(client, "Sync Conflict");
        var song = await CreateSongAsync(client, group.Id, "Song");
        var create = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{song.Id}/arrangements",
            new { label = "Versioned sync" });
        var arr = await create.Content.ReadFromJsonAsync<ArrangementDetailResponse>();
        Assert.NotNull(arr);

        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PatchAsJsonAsync(
                $"/api/groups/{group.Id}/arrangements/{arr.Id}",
                new
                {
                    chordTimingJson = """[{"lineIndex":0,"atMs":100}]""",
                    expectedVersion = 99
                })).StatusCode);
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
    private sealed record ArrangementListResponse(Guid Id, Guid SongId, string Label, int Version);
    private sealed record ArrangementDetailResponse(
        Guid Id,
        Guid SongId,
        string Label,
        string? DefaultKey,
        int? DefaultBpm,
        string? Lyrics,
        string? ChordTimingJson,
        int Version,
        List<ResourceSummaryResponse> Resources);
    private sealed record ResourceSummaryResponse(Guid Id, string Kind, string Label);
}
