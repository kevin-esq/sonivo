using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sonivo.Api.Tests;

public class CalendarApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public CalendarApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_returns_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/api/activity/calendar?from=2031-05-01T00:00:00Z&to=2031-06-01T00:00:00Z");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Returns_only_in_range_scheduled_events()
    {
        var owner = await CreateAuthenticatedClientAsync("calendar-owner@example.com");
        var group = await CreateGroupAsync(owner, "Calendar Band");

        var inRange = await CreateEventAsync(owner, group.Id, "In range", DateTimeOffset.Parse("2031-05-15T19:00:00Z"));
        var outOfRange = await CreateEventAsync(owner, group.Id, "Out of range", DateTimeOffset.Parse("2031-07-15T19:00:00Z"));
        var cancelled = await CreateEventAsync(owner, group.Id, "Cancelled", DateTimeOffset.Parse("2031-05-20T19:00:00Z"));
        var cancel = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/events/{cancelled.Id}/cancel",
            new { expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);

        var items = await owner.GetFromJsonAsync<List<CalendarEventResponse>>(
            "/api/activity/calendar?from=2031-05-01T00:00:00Z&to=2031-06-01T00:00:00Z",
            JsonOptions);

        Assert.NotNull(items);
        var mine = items.Where(i => i.GroupId == group.Id).ToList();
        Assert.Single(mine);
        Assert.Equal(inRange.Id, mine[0].EventId);
        Assert.DoesNotContain(items, i => i.EventId == outOfRange.Id || i.EventId == cancelled.Id);
    }

    [Fact]
    public async Task Invalid_or_too_wide_range_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("calendar-bad@example.com");

        var reversed = await client.GetAsync("/api/activity/calendar?from=2031-06-01T00:00:00Z&to=2031-05-01T00:00:00Z");
        Assert.Equal(HttpStatusCode.BadRequest, reversed.StatusCode);

        var tooWide = await client.GetAsync("/api/activity/calendar?from=2031-01-01T00:00:00Z&to=2031-06-01T00:00:00Z");
        Assert.Equal(HttpStatusCode.BadRequest, tooWide.StatusCode);

        var missing = await client.GetAsync("/api/activity/calendar");
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
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
    private sealed record CalendarEventResponse(
        Guid GroupId,
        string GroupName,
        Guid EventId,
        string Title,
        string Type,
        DateTimeOffset StartsAt);
}
