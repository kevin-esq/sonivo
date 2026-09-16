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
        List<EventPlanItemResponse> Items);
    private sealed record EventPlanItemResponse(
        Guid Id,
        Guid ArrangementId,
        int SortOrder,
        string DisplaySongTitle,
        string DisplayArrangementLabel);
}
