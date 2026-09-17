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

public class RsvpApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private static readonly DateTimeOffset Starts = DateTimeOffset.Parse("2026-09-22T18:30:00Z");
    private readonly SonivoApiFactory _factory;

    public RsvpApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_rsvp_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);
        var groupId = Guid.NewGuid();
        var eventId = Guid.NewGuid();

        var put = await client.PutAsJsonAsync(
            $"/api/groups/{groupId}/events/{eventId}/rsvp",
            new { response = "yes" });
        Assert.Equal(HttpStatusCode.Unauthorized, put.StatusCode);

        var get = await client.GetAsync($"/api/groups/{groupId}/events/{eventId}/rsvps");
        Assert.Equal(HttpStatusCode.Unauthorized, get.StatusCode);
    }

    [Fact]
    public async Task Owner_put_upserts_yes_then_no_as_one_row()
    {
        var client = await CreateAuthenticatedClientAsync("rsvp-owner@example.com", displayName: "Owner Ada");
        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me", JsonOptions);
        Assert.NotNull(me);
        var group = await CreateGroupAsync(client, "Rsvp Band");
        var created = await CreateEventAsync(client, group.Id, "Friday");

        var yes = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}/rsvp",
            new { response = "yes" });
        Assert.Equal(HttpStatusCode.OK, yes.StatusCode);
        var yesBody = await yes.Content.ReadFromJsonAsync<RsvpResponse>(JsonOptions);
        Assert.NotNull(yesBody);
        Assert.Equal(me.Id, yesBody.UserId);
        Assert.Equal("yes", yesBody.Response);

        var no = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}/rsvp",
            new { response = "no" });
        Assert.Equal(HttpStatusCode.OK, no.StatusCode);
        var noBody = await no.Content.ReadFromJsonAsync<RsvpResponse>(JsonOptions);
        Assert.NotNull(noBody);
        Assert.Equal(me.Id, noBody.UserId);
        Assert.Equal("no", noBody.Response);

        var list = await client.GetFromJsonAsync<RsvpListResponse>(
            $"/api/groups/{group.Id}/events/{created.Id}/rsvps",
            JsonOptions);
        Assert.NotNull(list);
        var item = Assert.Single(list.Items);
        Assert.Equal(me.Id, item.UserId);
        Assert.Equal("no", item.Response);
        Assert.Equal("Owner Ada", item.DisplayName);

        var detail = await client.GetFromJsonAsync<EventDetailResponse>(
            $"/api/groups/{group.Id}/events/{created.Id}",
            JsonOptions);
        Assert.NotNull(detail);
        Assert.Equal(1, detail.Version);
    }

    [Fact]
    public async Task Get_list_includes_display_name()
    {
        var client = await CreateAuthenticatedClientAsync("rsvp-list@example.com", displayName: "Pat List");
        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me", JsonOptions);
        Assert.NotNull(me);
        var group = await CreateGroupAsync(client, "Named Rsvp");
        var created = await CreateEventAsync(client, group.Id, "Show");

        var put = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}/rsvp",
            new { response = "maybe" });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var list = await client.GetFromJsonAsync<RsvpListResponse>(
            $"/api/groups/{group.Id}/events/{created.Id}/rsvps",
            JsonOptions);
        Assert.NotNull(list);
        var item = Assert.Single(list.Items);
        Assert.Equal(me.Id, item.UserId);
        Assert.Equal("Pat List", item.DisplayName);
        Assert.Equal("maybe", item.Response);
    }

    [Fact]
    public async Task Invalid_body_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("rsvp-bad@example.com");
        var group = await CreateGroupAsync(client, "Bad Rsvp");
        var created = await CreateEventAsync(client, group.Id, "Gig");

        var invalid = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}/rsvp",
            new { response = "going" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var missing = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/events/{created.Id}/rsvp",
            new { });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
    }

    [Fact]
    public async Task Member_can_put_rsvp()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("rsvp-own@example.com", "Password1", ownerId),
            ("rsvp-mem@example.com", "Password1", memberId),
            groupId,
            "Shared Rsvp",
            ownerId,
            memberId);

        var owner = await CreateAuthenticatedClientAsync("rsvp-own@example.com");
        var created = await CreateEventAsync(owner, groupId, "Rehearsal");

        var member = await CreateAuthenticatedClientAsync("rsvp-mem@example.com");
        var put = await member.PutAsJsonAsync(
            $"/api/groups/{groupId}/events/{created.Id}/rsvp",
            new { response = "yes" });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, put.StatusCode);
        var body = await put.Content.ReadFromJsonAsync<RsvpResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.Equal(memberId, body.UserId);
        Assert.Equal("yes", body.Response);
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(
        string email,
        string password = "Password1",
        string? displayName = null)
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
            displayName = displayName ?? email
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

    private static async Task<EventDetailResponse> CreateEventAsync(HttpClient client, Guid groupId, string title)
    {
        var create = await client.PostAsJsonAsync($"/api/groups/{groupId}/events", new
        {
            title,
            type = "rehearsal",
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
    private sealed record MeResponse(Guid Id, string Email, string? DisplayName);
    private sealed record GroupResponse(Guid Id, string Name, int Version);
    private sealed record EventDetailResponse(Guid Id, string Title, int Version);
    private sealed record RsvpResponse(Guid UserId, string Response, DateTimeOffset UpdatedAt);
    private sealed record RsvpListItemResponse(Guid UserId, string DisplayName, string Response, DateTimeOffset UpdatedAt);
    private sealed record RsvpListResponse(List<RsvpListItemResponse> Items);
}
