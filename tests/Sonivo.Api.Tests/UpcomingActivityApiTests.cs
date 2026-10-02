using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sonivo.Api.Tests;

public class UpcomingActivityApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public UpcomingActivityApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/api/activity/upcoming");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Returns_only_callers_upcoming_scheduled_events_ordered()
    {
        var owner = await CreateAuthenticatedClientAsync("activity-owner@example.com");
        var groupA = await CreateGroupAsync(owner, "Activity A");
        var groupB = await CreateGroupAsync(owner, "Activity B");

        var past = await CreateEventAsync(owner, groupA.Id, "Past", DateTimeOffset.UtcNow.AddDays(-2));
        var cancelled = await CreateEventAsync(owner, groupA.Id, "Cancelled", DateTimeOffset.UtcNow.AddDays(1));
        var later = await CreateEventAsync(owner, groupA.Id, "Later", DateTimeOffset.UtcNow.AddDays(5));
        var sooner = await CreateEventAsync(owner, groupB.Id, "Sooner", DateTimeOffset.UtcNow.AddDays(2));

        var cancel = await owner.PostAsJsonAsync(
            $"/api/groups/{groupA.Id}/events/{cancelled.Id}/cancel",
            new { expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);

        // Another user's group must not leak into this caller's feed.
        var stranger = await CreateAuthenticatedClientAsync("activity-stranger@example.com");
        await CreateGroupAsync(stranger, "Stranger Group");

        var items = await owner.GetFromJsonAsync<List<UpcomingActivityResponse>>(
            "/api/activity/upcoming",
            JsonOptions);

        Assert.NotNull(items);
        var mine = items.Where(i => i.GroupId == groupA.Id || i.GroupId == groupB.Id).ToList();
        Assert.Equal(2, mine.Count);
        Assert.DoesNotContain(mine, i => i.EventId == past.Id || i.EventId == cancelled.Id);
        Assert.Equal(sooner.Id, mine[0].EventId);
        Assert.Equal(later.Id, mine[1].EventId);
        Assert.DoesNotContain(items, i => i.GroupName == "Stranger Group");
    }

    private static async Task<EventCreated> CreateEventAsync(
        HttpClient client,
        Guid groupId,
        string title,
        DateTimeOffset startsAt)
    {
        var create = await client.PostAsJsonAsync($"/api/groups/{groupId}/events", new
        {
            title,
            type = "rehearsal",
            startsAt
        });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<EventCreated>(JsonOptions))!;
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
        return (await create.Content.ReadFromJsonAsync<GroupResponse>(JsonOptions))!;
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
    private sealed record EventCreated(Guid Id, string Title);
    private sealed record UpcomingActivityResponse(
        Guid GroupId,
        string GroupName,
        Guid EventId,
        string Title,
        string Type,
        DateTimeOffset StartsAt);
}
