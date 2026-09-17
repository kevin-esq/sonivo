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

public class EventApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private static readonly DateTimeOffset Starts = DateTimeOffset.Parse("2026-09-22T18:30:00Z");
    private readonly SonivoApiFactory _factory;

    public EventApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_event_list_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync($"/api/groups/{Guid.NewGuid()}/events");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_can_create_and_member_can_read_empty_plan()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("event-o@example.com", "Password1", ownerId),
            ("event-m@example.com", "Password1", memberId),
            groupId,
            "Event Band",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("event-o@example.com");
        var create = await ownerClient.PostAsJsonAsync($"/api/groups/{groupId}/events", new
        {
            title = "Friday rehearsal",
            type = "rehearsal",
            startsAt = Starts
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(created);
        Assert.Equal("Friday rehearsal", created.Title);
        Assert.Equal("rehearsal", created.Type);
        Assert.Equal("scheduled", created.Status);
        Assert.Equal(1, created.Version);
        Assert.Empty(created.Items);

        var memberClient = await CreateAuthenticatedClientAsync("event-m@example.com");
        var list = await memberClient.GetFromJsonAsync<List<EventListResponse>>(
            $"/api/groups/{groupId}/events",
            JsonOptions);
        Assert.NotNull(list);
        Assert.Contains(list, e => e.Id == created.Id && e.Title == "Friday rehearsal");

        var get = await memberClient.GetAsync($"/api/groups/{groupId}/events/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        var detail = await get.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(detail);
        Assert.Equal(Starts, detail.StartsAt);
        Assert.Empty(detail.Items);
    }

    [Fact]
    public async Task Invalid_type_or_blank_title_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("event-bad@example.com");
        var group = await CreateGroupAsync(client, "Bad Event Band");

        var blank = await client.PostAsJsonAsync($"/api/groups/{group.Id}/events", new
        {
            title = "  ",
            type = "rehearsal",
            startsAt = Starts
        });
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);

        var badType = await client.PostAsJsonAsync($"/api/groups/{group.Id}/events", new
        {
            title = "Gig",
            type = "party",
            startsAt = Starts
        });
        Assert.Equal(HttpStatusCode.BadRequest, badType.StatusCode);
    }

    [Fact]
    public async Task Member_cannot_create_event()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("event-own@example.com", "Password1", ownerId),
            ("event-mem@example.com", "Password1", memberId),
            groupId,
            "Shared Events",
            ownerId,
            memberId);

        var memberClient = await CreateAuthenticatedClientAsync("event-mem@example.com");
        var create = await memberClient.PostAsJsonAsync($"/api/groups/{groupId}/events", new
        {
            title = "Hack",
            type = "rehearsal",
            startsAt = Starts
        });
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
    }

    [Fact]
    public async Task Non_member_get_returns_404()
    {
        var ownerClient = await CreateAuthenticatedClientAsync("event-priv@example.com");
        var group = await CreateGroupAsync(ownerClient, "Private Events");
        var create = await ownerClient.PostAsJsonAsync($"/api/groups/{group.Id}/events", new
        {
            title = "Hidden",
            type = "performance",
            startsAt = Starts
        });
        var created = await create.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(created);

        var stranger = await CreateAuthenticatedClientAsync("event-stranger@example.com");
        var get = await stranger.GetAsync($"/api/groups/{group.Id}/events/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
    }

    [Fact]
    public async Task Owner_apply_setlist_copies_labels_and_confirm_replace_works()
    {
        var client = await CreateAuthenticatedClientAsync("apply-owner@example.com");
        var group = await CreateGroupAsync(client, "Apply Band");
        var song = await CreateSongAsync(client, group.Id, "Grace");
        var arrA = await CreateArrangementAsync(client, group.Id, song.Id, "Acoustic");
        var arrB = await CreateArrangementAsync(client, group.Id, song.Id, "Full Band");

        var setlistCreate = await client.PostAsJsonAsync($"/api/groups/{group.Id}/setlists", new { name = "Sunday" });
        var setlist = await setlistCreate.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(setlist);
        var replaceItems = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/setlists/{setlist.Id}/items",
            new
            {
                expectedVersion = 1,
                items = new[]
                {
                    new { arrangementId = arrA.Id, sortOrder = 1 },
                    new { arrangementId = arrB.Id, sortOrder = 2 }
                }
            });
        Assert.Equal(HttpStatusCode.OK, replaceItems.StatusCode);

        var eventCreate = await client.PostAsJsonAsync($"/api/groups/{group.Id}/events", new
        {
            title = "Friday",
            type = "rehearsal",
            startsAt = Starts
        });
        var musicalEvent = await eventCreate.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(musicalEvent);

        var apply = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = setlist.Id, expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.OK, apply.StatusCode);
        var applied = await apply.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(applied);
        Assert.Equal(2, applied.Version);
        Assert.Equal(2, applied.Items.Count);
        Assert.Equal("Grace", applied.Items[0].DisplaySongTitle);
        Assert.Equal("Acoustic", applied.Items[0].DisplayArrangementLabel);
        Assert.Equal(arrA.Id, applied.Items[0].ArrangementId);
        Assert.Equal(arrB.Id, applied.Items[1].ArrangementId);

        var blocked = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = setlist.Id, expectedVersion = 2, confirmReplace = false });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);

        var reorder = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/setlists/{setlist.Id}/items",
            new
            {
                expectedVersion = 2,
                items = new[]
                {
                    new { arrangementId = arrB.Id, sortOrder = 1 },
                    new { arrangementId = arrA.Id, sortOrder = 2 }
                }
            });
        Assert.Equal(HttpStatusCode.OK, reorder.StatusCode);

        var getBefore = await client.GetFromJsonAsync<EventDetailResponse>(
            $"/api/groups/{group.Id}/events/{musicalEvent.Id}",
            JsonOptions);
        Assert.NotNull(getBefore);
        Assert.Equal(arrA.Id, getBefore.Items[0].ArrangementId);
        Assert.Equal("Acoustic", getBefore.Items[0].DisplayArrangementLabel);

        var confirmed = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = setlist.Id, expectedVersion = 2, confirmReplace = true });
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        var after = await confirmed.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(after);
        Assert.Equal(3, after.Version);
        Assert.Equal(arrB.Id, after.Items[0].ArrangementId);
        Assert.Equal("Full Band", after.Items[0].DisplayArrangementLabel);
    }

    [Fact]
    public async Task Apply_authz_and_validation_contracts()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("apply-o@example.com", "Password1", ownerId),
            ("apply-m@example.com", "Password1", memberId),
            groupId,
            "Auth Apply",
            ownerId,
            memberId);

        var owner = await CreateAuthenticatedClientAsync("apply-o@example.com");
        var song = await CreateSongAsync(owner, groupId, "Song");
        var arr = await CreateArrangementAsync(owner, groupId, song.Id, "Live");
        var setlistCreate = await owner.PostAsJsonAsync($"/api/groups/{groupId}/setlists", new { name = "S" });
        var setlist = await setlistCreate.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(setlist);
        await owner.PutAsJsonAsync(
            $"/api/groups/{groupId}/setlists/{setlist.Id}/items",
            new { expectedVersion = 1, items = new[] { new { arrangementId = arr.Id, sortOrder = 1 } } });

        var emptyCreate = await owner.PostAsJsonAsync($"/api/groups/{groupId}/setlists", new { name = "Empty" });
        var empty = await emptyCreate.Content.ReadFromJsonAsync<SetlistDetailResponse>(JsonOptions);
        Assert.NotNull(empty);

        var eventCreate = await owner.PostAsJsonAsync($"/api/groups/{groupId}/events", new
        {
            title = "E",
            type = "rehearsal",
            startsAt = Starts
        });
        var musicalEvent = await eventCreate.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(musicalEvent);

        var emptyApply = await owner.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = empty.Id, expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, emptyApply.StatusCode);

        var stale = await owner.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = setlist.Id, expectedVersion = 99 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        var member = await CreateAuthenticatedClientAsync("apply-m@example.com");
        var memberApply = await member.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = setlist.Id, expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.Forbidden, memberApply.StatusCode);

        var stranger = await CreateAuthenticatedClientAsync("apply-stranger@example.com");
        var strangerApply = await stranger.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = setlist.Id, expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.NotFound, strangerApply.StatusCode);

        var anon = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var anonApply = await anon.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = setlist.Id, expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.Unauthorized, anonApply.StatusCode);

        var softDelete = await owner.SendAsync(new HttpRequestMessage(
            HttpMethod.Delete,
            $"/api/groups/{groupId}/arrangements/{arr.Id}")
        {
            Content = JsonContent.Create(new { expectedVersion = 1 })
        });
        Assert.Equal(HttpStatusCode.NoContent, softDelete.StatusCode);

        var blockedSoft = await owner.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{musicalEvent.Id}/apply-setlist",
            new { setlistId = setlist.Id, expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, blockedSoft.StatusCode);
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
    private sealed record SetlistDetailResponse(Guid Id, string Name, int Version);
    private sealed record EventListResponse(Guid Id, string Title, string Type, DateTimeOffset StartsAt, string Status, int Version);
    private sealed record EventDetailResponse(
        Guid Id,
        string Title,
        string Type,
        DateTimeOffset StartsAt,
        string Status,
        int Version,
        Guid? SourceSetlistId,
        List<EventPlanItemResponse> Items);
    private sealed record EventPlanItemResponse(
        Guid Id,
        Guid ArrangementId,
        int SortOrder,
        string DisplaySongTitle,
        string DisplayArrangementLabel);
}
