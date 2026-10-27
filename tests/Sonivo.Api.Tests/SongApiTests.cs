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

public class SongApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public SongApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_song_list_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync($"/api/groups/{Guid.NewGuid()}/songs");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_can_create_list_get_and_update_song()
    {
        var client = await CreateAuthenticatedClientAsync("song-owner@example.com");
        var group = await CreateGroupAsync(client, "Repertoire Band");

        var create = await client.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new
        {
            title = "Amazing Grace",
            attribution = "Newton",
            originKind = "cover",
            rightsNotes = "public domain"
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<SongDetailResponse>();
        Assert.NotNull(created);
        Assert.Equal("Amazing Grace", created.Title);
        Assert.Equal("cover", created.OriginKind);
        Assert.Equal(1, created.Version);
        Assert.Equal(0, created.ArrangementCount);

        var list = await client.GetFromJsonAsync<List<SongListResponse>>($"/api/groups/{group.Id}/songs");
        Assert.NotNull(list);
        Assert.Contains(list, s => s.Id == created.Id);

        var get = await client.GetAsync($"/api/groups/{group.Id}/songs/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        var detail = await get.Content.ReadFromJsonAsync<SongDetailResponse>();
        Assert.NotNull(detail);
        Assert.Equal("public domain", detail.RightsNotes);

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{created.Id}",
            new { title = "Amazing Grace (live)", expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var updated = await patch.Content.ReadFromJsonAsync<SongDetailResponse>();
        Assert.NotNull(updated);
        Assert.Equal("Amazing Grace (live)", updated.Title);
        Assert.Equal(2, updated.Version);
    }

    [Fact]
    public async Task Search_is_multi_field_paginated_and_favorites_are_per_user_and_idempotent()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("song-search-owner@example.com", "OwnerS1!", ownerId),
            ("song-search-member@example.com", "MemberS1!", memberId),
            groupId,
            "Search Band",
            ownerId,
            memberId);

        var owner = await CreateAuthenticatedClientAsync("song-search-owner@example.com", "OwnerS1!");
        var member = await CreateAuthenticatedClientAsync("song-search-member@example.com", "MemberS1!");
        var firstResponse = await owner.PostAsJsonAsync($"/api/groups/{groupId}/songs", new
        {
            title = "Morning Song",
            attribution = "Newton",
            originKind = "cover",
            tags = new[] { "worship", "morning" }
        });
        var secondResponse = await owner.PostAsJsonAsync($"/api/groups/{groupId}/songs", new
        {
            title = "Evening Song",
            attribution = "Traditional",
            originKind = "original",
            tags = new[] { "evening" }
        });
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, secondResponse.StatusCode);
        var first = await firstResponse.Content.ReadFromJsonAsync<SongDetailResponse>();
        var second = await secondResponse.Content.ReadFromJsonAsync<SongDetailResponse>();
        Assert.NotNull(first);
        Assert.NotNull(second);

        var firstArrangement = await owner.PostAsJsonAsync(
            $"/api/groups/{groupId}/songs/{first.Id}/arrangements",
            new { label = "Main" });
        Assert.Equal(HttpStatusCode.Created, firstArrangement.StatusCode);

        var byAttribution = await owner.GetFromJsonAsync<SongPageResponse>(
            $"/api/groups/{groupId}/songs?q=newton&pageSize=1");
        Assert.NotNull(byAttribution);
        Assert.Equal(1, byAttribution.TotalCount);
        Assert.Equal(first.Id, Assert.Single(byAttribution.Items).Id);

        var byTag = await owner.GetFromJsonAsync<SongPageResponse>(
            $"/api/groups/{groupId}/songs?tag=worship&page=1&pageSize=1");
        Assert.NotNull(byTag);
        Assert.Equal(1, byTag.TotalCount);
        Assert.Contains("worship", byTag.AvailableTags);

        var page = await owner.GetFromJsonAsync<SongPageResponse>(
            $"/api/groups/{groupId}/songs?page=1&pageSize=1");
        Assert.NotNull(page);
        Assert.Equal(2, page.TotalCount);
        Assert.Equal(2, page.TotalPages);
        Assert.Single(page.Items);
        var arrangementCounts = await owner.GetFromJsonAsync<SongPageResponse>(
            $"/api/groups/{groupId}/songs?q=Morning&pageSize=25");
        Assert.NotNull(arrangementCounts);
        Assert.Equal(1, Assert.Single(arrangementCounts.Items).ArrangementCount);

        var favoritePath = $"/api/groups/{groupId}/songs/{first.Id}/favorite";
        Assert.Equal(HttpStatusCode.NoContent, (await member.PutAsync(favoritePath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await member.PutAsync(favoritePath, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsync(
            $"/api/groups/{groupId}/songs/{second.Id}/favorite", null)).StatusCode);

        var memberFavorites = await member.GetFromJsonAsync<SongPageResponse>(
            $"/api/groups/{groupId}/songs?favoritesOnly=true");
        var ownerFavorites = await owner.GetFromJsonAsync<SongPageResponse>(
            $"/api/groups/{groupId}/songs?favoritesOnly=true");
        Assert.NotNull(memberFavorites);
        Assert.NotNull(ownerFavorites);
        Assert.Equal(first.Id, Assert.Single(memberFavorites.Items).Id);
        Assert.Equal(second.Id, Assert.Single(ownerFavorites.Items).Id);

        Assert.Equal(HttpStatusCode.NoContent, (await member.DeleteAsync(favoritePath)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await member.DeleteAsync(favoritePath)).StatusCode);
        var cleared = await member.GetFromJsonAsync<SongPageResponse>(
            $"/api/groups/{groupId}/songs?favoritesOnly=true");
        Assert.NotNull(cleared);
        Assert.Empty(cleared.Items);
        Assert.Equal(0, cleared.TotalCount);
    }

    [Fact]
    public async Task Search_rejects_invalid_paging_and_tag_filters()
    {
        var client = await CreateAuthenticatedClientAsync("song-search-validation@example.com");
        var group = await CreateGroupAsync(client, "Search Validation");

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.GetAsync($"/api/groups/{group.Id}/songs?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.GetAsync($"/api/groups/{group.Id}/songs?pageSize=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.GetAsync($"/api/groups/{group.Id}/songs?tag=two%2ctags")).StatusCode);
    }

    [Fact]
    public async Task Duplicate_titles_are_allowed()
    {
        var client = await CreateAuthenticatedClientAsync("song-dup@example.com");
        var group = await CreateGroupAsync(client, "Dup Band");

        var first = await client.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new
        {
            title = "Same",
            originKind = "original"
        });
        var second = await client.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new
        {
            title = "Same",
            originKind = "cover"
        });

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
    }

    [Fact]
    public async Task Non_member_song_routes_return_404()
    {
        var owner = await CreateAuthenticatedClientAsync("song-owner-b@example.com");
        var group = await CreateGroupAsync(owner, "Private Songs");
        var create = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new
        {
            title = "Hidden",
            originKind = "original"
        });
        var song = await create.Content.ReadFromJsonAsync<SongDetailResponse>();
        Assert.NotNull(song);

        var stranger = await CreateAuthenticatedClientAsync("song-stranger@example.com");
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync($"/api/groups/{group.Id}/songs")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync($"/api/groups/{group.Id}/songs?q=Hidden&page=1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync($"/api/groups/{group.Id}/songs/{song.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.PutAsync($"/api/groups/{group.Id}/songs/{song.Id}/favorite", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new
            {
                title = "Nope",
                originKind = "original"
            })).StatusCode);
    }

    [Fact]
    public async Task Member_create_and_update_return_403()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();

        await SeedUsersAndMembershipAsync(
            ("song-owner-c@example.com", "OwnerC1!", ownerId),
            ("song-member-c@example.com", "MemberC1!", memberId),
            groupId,
            "Shared Songs",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("song-owner-c@example.com", "OwnerC1!");
        var create = await ownerClient.PostAsJsonAsync($"/api/groups/{groupId}/songs", new
        {
            title = "Owned",
            originKind = "original"
        });
        var song = await create.Content.ReadFromJsonAsync<SongDetailResponse>();
        Assert.NotNull(song);

        var memberClient = await CreateAuthenticatedClientAsync("song-member-c@example.com", "MemberC1!");
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PostAsJsonAsync($"/api/groups/{groupId}/songs", new
            {
                title = "Member Song",
                originKind = "original"
            })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PatchAsJsonAsync(
                $"/api/groups/{groupId}/songs/{song.Id}",
                new { title = "Hacked", expectedVersion = 1 })).StatusCode);

        var list = await memberClient.GetAsync($"/api/groups/{groupId}/songs");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
    }

    [Fact]
    public async Task Blank_title_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("song-blank@example.com");
        var group = await CreateGroupAsync(client, "Validation Band");
        var create = await client.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new
        {
            title = "   ",
            originKind = "original"
        });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
    }

    [Fact]
    public async Task Invalid_origin_kind_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("song-origin@example.com");
        var group = await CreateGroupAsync(client, "Origin Band");
        var create = await client.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new
        {
            title = "Song",
            originKind = "remix"
        });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
    }

    [Fact]
    public async Task Stale_version_returns_409()
    {
        var client = await CreateAuthenticatedClientAsync("song-conflict@example.com");
        var group = await CreateGroupAsync(client, "Conflict Band");
        var create = await client.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new
        {
            title = "Versioned",
            originKind = "original"
        });
        var song = await create.Content.ReadFromJsonAsync<SongDetailResponse>();
        Assert.NotNull(song);

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{song.Id}",
            new { title = "Nope", expectedVersion = 99 });
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
        var group = await create.Content.ReadFromJsonAsync<GroupResponse>();
        return group ?? throw new InvalidOperationException("Missing group response");
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
    private sealed record SongListResponse(Guid Id, string Title, string? Attribution, string OriginKind, int Version);
    private sealed record SongDetailResponse(
        Guid Id,
        string Title,
        string? Attribution,
        string OriginKind,
        string? RightsNotes,
        int Version,
        int ArrangementCount);
    private sealed record SongPageResponse(
        List<SongPageItemResponse> Items,
        int TotalCount,
        int Page,
        int PageSize,
        int TotalPages,
        List<string> AvailableTags);
    private sealed record SongPageItemResponse(Guid Id, string Title, bool IsFavorite, int ArrangementCount);
}
