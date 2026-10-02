using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

/// <summary>Phase 4.4 (F4): Owner|Manager|Member|Viewer section permissions and the group audit log.</summary>
public class GroupRolesApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public GroupRolesApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Manager_can_manage_content_but_not_membership()
    {
        var owner = await CreateAuthenticatedClientAsync("f4-manager-owner@example.com");
        var group = await CreateGroupAsync(owner, "Manager Band");
        var manager = await CreateMemberClientAsync(group.Id, MembershipRoles.Manager, "f4-manager@example.com");

        // Content: allowed.
        var song = await manager.PostAsJsonAsync($"/api/groups/{group.Id}/songs",
            new { title = "Tema", originKind = "original" });
        Assert.Equal(HttpStatusCode.Created, song.StatusCode);

        // Membership and group settings: still Owner-only.
        var ownerId = await GetUserIdAsync("f4-manager-owner@example.com");
        Assert.Equal(HttpStatusCode.Forbidden,
            (await manager.DeleteAsync($"/api/groups/{group.Id}/members/{ownerId}")).StatusCode);

        var roleChange = await manager.PostAsJsonAsync(
            $"/api/groups/{group.Id}/members/{ownerId}/role", new { role = "Member" });
        Assert.Equal(HttpStatusCode.Forbidden, roleChange.StatusCode);

        var settings = await manager.PatchAsJsonAsync($"/api/groups/{group.Id}",
            new { name = "Hacked", expectedVersion = 0 });
        Assert.Equal(HttpStatusCode.Forbidden, settings.StatusCode);
    }

    [Fact]
    public async Task Member_cannot_manage_content()
    {
        var owner = await CreateAuthenticatedClientAsync("f4-member-owner@example.com");
        var group = await CreateGroupAsync(owner, "Member Band");
        var member = await CreateMemberClientAsync(group.Id, MembershipRoles.Member, "f4-member@example.com");

        var song = await member.PostAsJsonAsync($"/api/groups/{group.Id}/songs",
            new { title = "No", originKind = "original" });
        Assert.Equal(HttpStatusCode.Forbidden, song.StatusCode);

        // Reading is allowed.
        var list = await member.GetAsync($"/api/groups/{group.Id}/songs");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
    }

    [Fact]
    public async Task Viewer_reads_but_cannot_rsvp()
    {
        var owner = await CreateAuthenticatedClientAsync("f4-viewer-owner@example.com");
        var group = await CreateGroupAsync(owner, "Viewer Band");
        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/events",
            new { title = "Ensayo", type = "rehearsal", startsAt = DateTimeOffset.UtcNow.AddDays(2) });
        created.EnsureSuccessStatusCode();
        var musicalEvent = await created.Content.ReadFromJsonAsync<EventResponse>();
        Assert.NotNull(musicalEvent);

        var viewer = await CreateMemberClientAsync(group.Id, MembershipRoles.Viewer, "f4-viewer@example.com");
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync($"/api/groups/{group.Id}/songs")).StatusCode);

        var rsvp = await viewer.PutAsJsonAsync(
            $"/api/groups/{group.Id}/events/{musicalEvent!.Id}/rsvp", new { response = "yes" });
        Assert.Equal(HttpStatusCode.Forbidden, rsvp.StatusCode);
    }

    [Fact]
    public async Task Musical_role_round_trips_and_is_audited()
    {
        var owner = await CreateAuthenticatedClientAsync("f4-musical-owner@example.com");
        var group = await CreateGroupAsync(owner, "Musical Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Member, "f4-musical@example.com");

        var set = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/musical-role", new { musicalRole = "Bajo" });
        Assert.Equal(HttpStatusCode.NoContent, set.StatusCode);

        var members = await owner.GetFromJsonAsync<MembersResponse>($"/api/groups/{group.Id}/members");
        Assert.Contains(members!.Items, i => i.UserId == memberId && i.MusicalRole == "Bajo");

        var audit = await owner.GetFromJsonAsync<AuditResponse>($"/api/groups/{group.Id}/audit");
        Assert.Contains(audit!.Items, e => e.Action == GroupAuditEntry.ActionMusicalRoleChanged);
    }

    [Fact]
    public async Task Role_change_is_audited_and_invalid_roles_are_rejected()
    {
        var owner = await CreateAuthenticatedClientAsync("f4-audit-owner@example.com");
        var group = await CreateGroupAsync(owner, "Audit Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Member, "f4-audit@example.com");

        var promote = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/role", new { role = "Manager" });
        Assert.Equal(HttpStatusCode.NoContent, promote.StatusCode);

        var invalid = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/role", new { role = "Super" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var audit = await owner.GetFromJsonAsync<AuditResponse>($"/api/groups/{group.Id}/audit");
        Assert.Contains(audit!.Items, e =>
            e.Action == GroupAuditEntry.ActionRoleChanged
            && e.TargetUserId == memberId
            && e.Metadata == "Manager");
    }

    [Fact]
    public async Task Group_audit_log_is_owner_only()
    {
        var owner = await CreateAuthenticatedClientAsync("f4-audit-read-owner@example.com");
        var group = await CreateGroupAsync(owner, "Audit Read Band");
        var manager = await CreateMemberClientAsync(group.Id, MembershipRoles.Manager, "f4-audit-read@example.com");

        Assert.Equal(HttpStatusCode.Forbidden, (await manager.GetAsync($"/api/groups/{group.Id}/audit")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/groups/{group.Id}/audit")).StatusCode);
    }

    [Fact]
    public async Task Cannot_demote_the_last_owner()
    {
        var owner = await CreateAuthenticatedClientAsync("f4-last-owner@example.com");
        var group = await CreateGroupAsync(owner, "Last Owner Band");
        var ownerId = await GetUserIdAsync("f4-last-owner@example.com");

        var demote = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/members/{ownerId}/role", new { role = "Manager" });
        Assert.Equal(HttpStatusCode.Conflict, demote.StatusCode);
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password = "Password1")
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        await client.PostAsJsonAsync("/api/auth/register", new { email, password, displayName = email });
        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password, rememberMe = false });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private async Task<Guid> CreateMemberAsync(Guid groupId, string role, string email)
    {
        var userId = Guid.NewGuid();
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            var user = new ApplicationUser
            {
                Id = userId,
                Email = email,
                UserName = email,
                DisplayName = email,
                EmailConfirmed = true
            };
            var created = await users.CreateAsync(user, "Password1");
            Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));

            var membership = Membership.CreateMember(groupId, userId, DateTimeOffset.UtcNow);
            if (role != MembershipRoles.Member)
            {
                membership.AssignRole(role);
            }

            db.Memberships.Add(membership);
            await db.SaveChangesAsync();
        }

        return userId;
    }

    private async Task<HttpClient> CreateMemberClientAsync(Guid groupId, string role, string email)
    {
        await CreateMemberAsync(groupId, role, email);
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Password1", rememberMe = false });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private async Task<Guid> GetUserIdAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);
        Assert.NotNull(user);
        return user!.Id;
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
    private sealed record MemberRow(Guid UserId, string DisplayName, string Role, string? MusicalRole);
    private sealed record MembersResponse(List<MemberRow> Items);
    private sealed record AuditRow(Guid Id, string Action, Guid? ActorUserId, Guid? TargetUserId, string? Metadata);
    private sealed record AuditResponse(List<AuditRow> Items);
}
