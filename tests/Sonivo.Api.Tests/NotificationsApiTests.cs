using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Notifications;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

/// <summary>Phase 4.8 (F5): event/RSVP notifications and the per-group ICS feed (ADR-0052).</summary>
public class NotificationsApiTests : IClassFixture<NotificationsOnFactory>, IClassFixture<GroupBrandingOffFactory>
{
    private readonly NotificationsOnFactory _factoryOn;
    private readonly GroupBrandingOffFactory _factoryOff;

    public NotificationsApiTests(NotificationsOnFactory factoryOn, GroupBrandingOffFactory factoryOff)
    {
        _factoryOn = factoryOn;
        _factoryOff = factoryOff;
    }

    [Fact]
    public async Task Calendar_feed_contains_upcoming_events()
    {
        var client = await CreateAuthenticatedClientAsync(_factoryOn, "f5-ics-owner@example.com");
        var group = await CreateGroupAsync(client, "ICS Band");
        var startsAt = DateTimeOffset.UtcNow.AddDays(3);
        var created = await client.PostAsJsonAsync($"/api/groups/{group.Id}/events",
            new { title = "Ensayo ICS", type = "rehearsal", startsAt });
        created.EnsureSuccessStatusCode();

        var response = await client.GetAsync($"/api/groups/{group.Id}/calendar.ics");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/calendar", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("BEGIN:VCALENDAR", body);
        Assert.Contains("Ensayo ICS", body);
        Assert.Contains("BEGIN:VEVENT", body);
    }

    [Fact]
    public async Task Calendar_feed_is_404_when_the_flag_is_off_and_for_non_members()
    {
        // Flag off → 404.
        var offOwner = await CreateAuthenticatedClientAsync(_factoryOff, "f5-ics-off@example.com");
        var offGroup = await CreateGroupAsync(offOwner, "ICS Off Band");
        Assert.Equal(HttpStatusCode.NotFound,
            (await offOwner.GetAsync($"/api/groups/{offGroup.Id}/calendar.ics")).StatusCode);

        // Flag on, outsider → 404 (no existence leak).
        var owner = await CreateAuthenticatedClientAsync(_factoryOn, "f5-ics-on@example.com");
        var group = await CreateGroupAsync(owner, "ICS On Band");
        var outsider = await CreateAuthenticatedClientAsync(_factoryOn, "f5-ics-outsider@example.com");
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.GetAsync($"/api/groups/{group.Id}/calendar.ics")).StatusCode);
    }

    [Fact]
    public async Task Creating_and_cancelling_an_event_emails_members()
    {
        var email = "f5-notify-owner@example.com";
        var client = await CreateAuthenticatedClientAsync(_factoryOn, email);
        var group = await CreateGroupAsync(client, "Notify Band");
        var sender = _factoryOn.Services.GetRequiredService<CapturingEmailSender>();
        sender.Clear();

        var created = await client.PostAsJsonAsync($"/api/groups/{group.Id}/events",
            new { title = "Concierto", type = "performance", startsAt = DateTimeOffset.UtcNow.AddDays(5) });
        created.EnsureSuccessStatusCode();
        var musicalEvent = await created.Content.ReadFromJsonAsync<EventResponse>();
        Assert.NotNull(musicalEvent);

        Assert.Contains(sender.Sent, m => m.To == email && m.Subject.Contains("Concierto"));

        sender.Clear();
        var cancel = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/events/{musicalEvent!.Id}/cancel", new { expectedVersion = 1 });
        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);
        Assert.Contains(sender.Sent, m => m.To == email && m.Subject.Contains("cancelado"));
    }

    [Fact]
    public async Task Rsvp_confirmation_goes_to_the_responder()
    {
        var email = "f5-rsvp-owner@example.com";
        var client = await CreateAuthenticatedClientAsync(_factoryOn, email);
        var group = await CreateGroupAsync(client, "Rsvp Band");
        var sender = _factoryOn.Services.GetRequiredService<CapturingEmailSender>();

        var created = await client.PostAsJsonAsync($"/api/groups/{group.Id}/events",
            new { title = "Ensayo RSVP", type = "rehearsal", startsAt = DateTimeOffset.UtcNow.AddDays(4) });
        created.EnsureSuccessStatusCode();
        var musicalEvent = await created.Content.ReadFromJsonAsync<EventResponse>();
        sender.Clear();

        var rsvp = await client.PutAsJsonAsync(
            $"/api/groups/{group.Id}/events/{musicalEvent!.Id}/rsvp", new { response = "yes" });
        Assert.Equal(HttpStatusCode.OK, rsvp.StatusCode);
        Assert.Contains(sender.Sent, m => m.To == email && m.Subject.Contains("Asistencia"));
    }

    [Fact]
    public async Task Group_notification_preferences_belong_to_the_current_member_and_control_delivery()
    {
        const string ownerEmail = "notification-preferences-owner@example.com";
        const string memberEmail = "notification-preferences-member@example.com";
        var owner = await CreateAuthenticatedClientAsync(_factoryOn, ownerEmail);
        var group = await CreateGroupAsync(owner, "Preferences Band");
        var member = await CreateAuthenticatedClientAsync(_factoryOn, memberEmail);
        ApplicationUser? memberUser;
        using (var identityScope = _factoryOn.Services.CreateScope())
        {
            memberUser = await identityScope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>()
                .FindByEmailAsync(memberEmail);
        }
        Assert.NotNull(memberUser);

        using (var scope = _factoryOn.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            db.Memberships.Add(Membership.CreateMember(group.Id, memberUser!.Id, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        }

        var initial = await member.GetFromJsonAsync<PreferencesResponse>(
            $"/api/groups/{group.Id}/notification-preferences");
        Assert.NotNull(initial);
        Assert.True(initial.NotifyRoleChanges);
        Assert.True(initial.NotifyTaskAssignments);

        var saved = await member.PutAsJsonAsync(
            $"/api/groups/{group.Id}/notification-preferences",
            new { notifyRoleChanges = false, notifyTaskAssignments = false });
        Assert.Equal(HttpStatusCode.NoContent, saved.StatusCode);

        var mutedRoleChange = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberUser!.Id}/role", new { role = MembershipRoles.Viewer });
        Assert.Equal(HttpStatusCode.NoContent, mutedRoleChange.StatusCode);
        var mutedRoleInbox = await member.GetFromJsonAsync<NotificationInboxResponse>(
            $"/api/notifications?scope=group&groupId={group.Id}");
        Assert.NotNull(mutedRoleInbox);
        Assert.DoesNotContain(mutedRoleInbox.Items, item => item.Kind == Notification.KindRoleChanged);

        var task = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/tasks",
            new { title = "Assigned while muted", notes = (string?)null, dueAt = (DateTimeOffset?)null, assigneeUserId = memberUser!.Id });
        Assert.Equal(HttpStatusCode.Created, task.StatusCode);

        var mutedInbox = await member.GetFromJsonAsync<NotificationInboxResponse>(
            $"/api/notifications?scope=group&groupId={group.Id}");
        Assert.NotNull(mutedInbox);
        Assert.DoesNotContain(mutedInbox.Items, item => item.Kind == Notification.KindTaskAssigned);

        var reenabled = await member.PutAsJsonAsync(
            $"/api/groups/{group.Id}/notification-preferences",
            new { notifyRoleChanges = true, notifyTaskAssignments = true });
        Assert.Equal(HttpStatusCode.NoContent, reenabled.StatusCode);

        var enabledRoleChange = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberUser!.Id}/role", new { role = MembershipRoles.Member });
        Assert.Equal(HttpStatusCode.NoContent, enabledRoleChange.StatusCode);

        var secondTask = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/tasks",
            new { title = "Assigned while enabled", notes = (string?)null, dueAt = (DateTimeOffset?)null, assigneeUserId = memberUser!.Id });
        Assert.Equal(HttpStatusCode.Created, secondTask.StatusCode);

        var enabledInbox = await member.GetFromJsonAsync<NotificationInboxResponse>(
            $"/api/notifications?scope=group&groupId={group.Id}");
        Assert.NotNull(enabledInbox);
        Assert.Contains(enabledInbox.Items, item => item.Kind == Notification.KindTaskAssigned);
        Assert.Contains(enabledInbox.Items, item => item.Kind == Notification.KindRoleChanged);

        // Account security notifications are a separate scope and are unaffected by Group settings.
        using var accountScope = _factoryOn.Services.CreateScope();
        var accountDb = accountScope.ServiceProvider.GetRequiredService<SonivoDbContext>();
        accountDb.Notifications.Add(Notification.Create(
            memberUser!.Id,
            NotificationScope.Account,
            Notification.KindPasswordChanged,
            DateTimeOffset.UtcNow));
        await accountDb.SaveChangesAsync();
        var accountInbox = await member.GetFromJsonAsync<NotificationInboxResponse>("/api/notifications?scope=account");
        Assert.NotNull(accountInbox);
        Assert.Contains(accountInbox.Items, item => item.Kind == Notification.KindPasswordChanged);
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(
        WebApplicationFactory<Program> factory,
        string email,
        string password = "Password1")
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        await client.PostAsJsonAsync("/api/auth/register", new { email, password, displayName = email });
        await AuthTestHelper.ConfirmEmailAsync(factory.Services, email);
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password, rememberMe = false });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private static async Task<GroupResponse> CreateGroupAsync(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/groups", new { name });
        response.EnsureSuccessStatusCode();
        var group = await response.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(group);
        return group!;
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

    private sealed record GroupResponse(Guid Id, string Name, string? Slug);
    private sealed record EventResponse(Guid Id, string Title);
    private sealed record PreferencesResponse(bool NotifyRoleChanges, bool NotifyTaskAssignments);
    private sealed record NotificationInboxResponse(int UnreadCount, IReadOnlyList<NotificationResponse> Items);
    private sealed record NotificationResponse(Guid Id, string Kind);
}

/// <summary>Captures outbound email instead of hitting the email transport.</summary>
public sealed class CapturingEmailSender : IEmailSender
{
    private readonly List<OutboundEmail> _sent = [];
    private readonly Lock _gate = new();

    public bool IsConfigured => true;

    public IReadOnlyList<OutboundEmail> Sent
    {
        get
        {
            lock (_gate)
            {
                return _sent.ToList();
            }
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _sent.Clear();
        }
    }

    public Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            _sent.Add(email);
        }

        return Task.FromResult(true);
    }
}

/// <summary>F5: notifications on, with a capturing mail sender.</summary>
public sealed class NotificationsOnFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"sonivo-notify-{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("UseInMemoryDatabase", "true");
        builder.UseSetting("InMemoryDatabaseName", _dbName);
        builder.UseSetting("ConnectionStrings:Default", "Host=unused;Database=unused;Username=unused;Password=unused");
        builder.UseSetting("Email:Endpoint", "");
        builder.UseSetting("Email:ApiKey", "");
        builder.UseSetting("Email:ApiKey", "");
        builder.UseSetting("Email:From", "");
        builder.UseSetting("PublicOrigin", "");
        builder.UseSetting("Authentication:Google:ClientId", "");
        builder.UseSetting("Authentication:Google:ClientSecret", "");
        builder.UseSetting("Authentication:Google:EnableTestHook", "false");
        builder.UseSetting("Features:GroupBranding", "true");
        builder.UseSetting("Features:Notifications", "true");
        builder.UseSetting("R2:AccountId", "");
        builder.UseSetting("R2:AccessKey", "");
        builder.UseSetting("R2:Secret", "");
        builder.UseSetting("R2:BucketName", "");
        builder.ConfigureServices(services =>
        {
            var capture = new CapturingEmailSender();
            services.AddSingleton(capture);
            services.AddSingleton<IEmailSender>(capture);
        });
    }
}
