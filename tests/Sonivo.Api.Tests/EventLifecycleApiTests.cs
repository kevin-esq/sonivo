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

public class EventLifecycleApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private static readonly DateTimeOffset Starts = DateTimeOffset.Parse("2026-09-23T18:30:00Z");
    private readonly SonivoApiFactory _factory;

    public EventLifecycleApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Owner_patch_title_bumps_version_and_keeps_omitted_fields()
    {
        var client = await CreateAuthenticatedClientAsync("life-owner@patch.example");
        var group = await CreateGroupAsync(client, "Patch Band");
        var created = await CreateEventAsync(client, group.Id, "Friday rehearsal", "rehearsal");

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}",
            new { expectedVersion = 1, title = " Friday live " });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var updated = await patch.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(updated);
        Assert.Equal("Friday live", updated.Title);
        Assert.Equal("rehearsal", updated.Type);
        Assert.Equal(Starts, updated.StartsAt);
        Assert.Equal(2, updated.Version);
        Assert.Equal("scheduled", updated.Status);
    }

    [Fact]
    public async Task Member_patch_returns_403_non_member_404_anon_401()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("life-own@patch.example", "Password1", ownerId),
            ("life-mem@patch.example", "Password1", memberId),
            groupId,
            "Shared Patch",
            ownerId,
            memberId);

        var owner = await CreateAuthenticatedClientAsync("life-own@patch.example");
        var created = await CreateEventAsync(owner, groupId, "Show", "performance");

        var member = await CreateAuthenticatedClientAsync("life-mem@patch.example");
        var memberPatch = await member.PatchAsJsonAsync(
            $"/api/groups/{groupId}/events/{created.Id}",
            new { expectedVersion = 1, title = "Hacked" });
        Assert.Equal(HttpStatusCode.Forbidden, memberPatch.StatusCode);

        var stranger = await CreateAuthenticatedClientAsync("life-stranger@patch.example");
        var strangerPatch = await stranger.PatchAsJsonAsync(
            $"/api/groups/{groupId}/events/{created.Id}",
            new { expectedVersion = 1, title = "Nope" });
        Assert.Equal(HttpStatusCode.NotFound, strangerPatch.StatusCode);

        var anon = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(anon);
        var anonPatch = await anon.PatchAsJsonAsync(
            $"/api/groups/{groupId}/events/{created.Id}",
            new { expectedVersion = 1, title = "Anon" });
        Assert.Equal(HttpStatusCode.Unauthorized, anonPatch.StatusCode);
    }

    [Fact]
    public async Task Patch_stale_version_returns_409()
    {
        var client = await CreateAuthenticatedClientAsync("life-stale@patch.example");
        var group = await CreateGroupAsync(client, "Stale Patch");
        var created = await CreateEventAsync(client, group.Id, "Show", "performance");

        var stale = await client.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}",
            new { expectedVersion = 99, title = "Nope" });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task Owner_cancel_204_hides_from_list_member_get_404_owner_get_200()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("life-cancel-o@patch.example", "Password1", ownerId),
            ("life-cancel-m@patch.example", "Password1", memberId),
            groupId,
            "Cancel Band",
            ownerId,
            memberId);

        var owner = await CreateAuthenticatedClientAsync("life-cancel-o@patch.example");
        var created = await CreateEventAsync(owner, groupId, "Show", "performance");

        var cancel = await owner.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{created.Id}/cancel",
            new { expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);

        var list = await owner.GetFromJsonAsync<List<EventListResponse>>(
            $"/api/groups/{groupId}/events",
            JsonOptions);
        Assert.NotNull(list);
        Assert.DoesNotContain(list, e => e.Id == created.Id);

        var ownerGet = await owner.GetAsync($"/api/groups/{groupId}/events/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, ownerGet.StatusCode);
        var detail = await ownerGet.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions);
        Assert.NotNull(detail);
        Assert.Equal("cancelled", detail.Status);
        Assert.Equal(2, detail.Version);

        var member = await CreateAuthenticatedClientAsync("life-cancel-m@patch.example");
        var memberGet = await member.GetAsync($"/api/groups/{groupId}/events/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, memberGet.StatusCode);
        var memberList = await member.GetFromJsonAsync<List<EventListResponse>>(
            $"/api/groups/{groupId}/events",
            JsonOptions);
        Assert.NotNull(memberList);
        Assert.DoesNotContain(memberList, e => e.Id == created.Id);
    }

    [Fact]
    public async Task Cancel_already_cancelled_returns_400_member_cancel_403()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("life-again-o@patch.example", "Password1", ownerId),
            ("life-again-m@patch.example", "Password1", memberId),
            groupId,
            "Cancel Twice",
            ownerId,
            memberId);

        var owner = await CreateAuthenticatedClientAsync("life-again-o@patch.example");
        var created = await CreateEventAsync(owner, groupId, "Show", "performance");

        var first = await owner.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{created.Id}/cancel",
            new { expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);

        var again = await owner.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{created.Id}/cancel",
            new { expectedVersion = 2 });
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);

        var live = await CreateEventAsync(owner, groupId, "Still on", "rehearsal");
        var member = await CreateAuthenticatedClientAsync("life-again-m@patch.example");
        var memberCancel = await member.PostAsJsonAsync(
            $"/api/groups/{groupId}/events/{live.Id}/cancel",
            new { expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.Forbidden, memberCancel.StatusCode);
    }

    [Fact]
    public async Task Patch_cancelled_event_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("life-patch-cancel@patch.example");
        var group = await CreateGroupAsync(client, "Patch Cancelled");
        var created = await CreateEventAsync(client, group.Id, "Show", "performance");
        var cancel = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}/cancel",
            new { expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);

        var patch = await client.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}",
            new { expectedVersion = 2, title = "Nope" });
        Assert.Equal(HttpStatusCode.BadRequest, patch.StatusCode);
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
        var group = await create.Content.ReadFromJsonAsync<GroupResponse>(JsonOptions);
        return group ?? throw new InvalidOperationException("Missing group response");
    }

    private static async Task<EventDetailResponse> CreateEventAsync(
        HttpClient client,
        Guid groupId,
        string title,
        string type)
    {
        var create = await client.PostAsJsonAsync($"/api/groups/{groupId}/events", new
        {
            title,
            type,
            startsAt = Starts
        });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<EventDetailResponse>(JsonOptions))!;
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
