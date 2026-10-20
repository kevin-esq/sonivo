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
public class GroupRolesApiTests : IDisposable
{
    private readonly SonivoApiFactory _factory;

    public GroupRolesApiTests()
    {
        // Keep the auth limiter and in-memory database isolated per test. A
        // class-shared TestServer makes unrelated role tests consume one
        // another's legitimate per-IP login budget.
        _factory = new SonivoApiFactory();
    }

    public void Dispose() => _factory.Dispose();

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

    [Fact]
    public async Task Custom_role_accepts_assignable_permissions_and_is_assignable_to_a_member()
    {
        var owner = await CreateAuthenticatedClientAsync("adr78-owner@example.com");
        var group = await CreateGroupAsync(owner, "Custom Roles Band");

        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Setlist editor",
            description = "Edits setlists",
            permissions = new[] { GroupPermissions.SetlistEdit, GroupPermissions.SongEdit }
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var role = await created.Content.ReadFromJsonAsync<RoleResponse>();
        Assert.NotNull(role);
        Assert.False(role!.IsSystem);
        Assert.Equal("setlist.edit,song.edit", role.Permissions);
        Assert.False(role.ExtendsBaseRole);

        var custom = await owner.GetFromJsonAsync<RolesResponse>($"/api/groups/{group.Id}/roles");
        Assert.Contains(custom!.Items, r => r.Id == role.Id);

        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Member, "adr78-member@example.com");
        var assign = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role", new { groupRoleId = role.Id });
        Assert.Equal(HttpStatusCode.NoContent, assign.StatusCode);

        var audit = await owner.GetFromJsonAsync<AuditResponse>($"/api/groups/{group.Id}/audit");
        Assert.Contains(audit!.Items, row =>
            row.Action == GroupAuditEntry.ActionGroupRoleCreated
            && row.ActorUserId is not null
            && row.Metadata == $"roleId={role.Id:D}");
        Assert.Contains(audit.Items, row =>
            row.Action == GroupAuditEntry.ActionGroupRoleAssigned
            && row.TargetUserId == memberId
            && row.Metadata == $"roleId={role.Id:D}");
    }

    [Fact]
    public async Task Deleting_custom_role_clears_only_assignments_in_its_group()
    {
        var owner = await CreateAuthenticatedClientAsync("role-delete-owner@example.com");
        var group = await CreateGroupAsync(owner, "Role Delete Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Member, "role-delete-member@example.com");

        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Temporary role",
            permissions = new[] { GroupPermissions.SongView }
        });
        created.EnsureSuccessStatusCode();
        var role = (await created.Content.ReadFromJsonAsync<RoleResponse>())!;
        var assigned = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role", new { groupRoleId = role.Id });
        Assert.Equal(HttpStatusCode.NoContent, assigned.StatusCode);

        var deleted = await owner.DeleteAsync($"/api/groups/{group.Id}/roles/{role.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var members = await owner.GetFromJsonAsync<MembersResponse>($"/api/groups/{group.Id}/members");
        Assert.Null(members!.Items.Single(row => row.UserId == memberId).GroupRoleId);
        var audit = await owner.GetFromJsonAsync<AuditResponse>($"/api/groups/{group.Id}/audit");
        Assert.Contains(audit!.Items, row =>
            row.Action == GroupAuditEntry.ActionGroupRoleDeleted
            && row.Metadata == $"roleId={role.Id:D}");
    }

    [Fact]
    public async Task Custom_role_permission_mode_can_be_changed_by_an_owner()
    {
        var owner = await CreateAuthenticatedClientAsync("role-mode-owner@example.com");
        var group = await CreateGroupAsync(owner, "Role Mode Band");
        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Legacy profile",
            permissions = new[] { GroupPermissions.SongView }
        });
        created.EnsureSuccessStatusCode();
        var role = (await created.Content.ReadFromJsonAsync<RoleResponse>())!;
        Assert.False(role.ExtendsBaseRole);

        var enabled = await owner.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/roles/{role.Id}", new { extendsBaseRole = true });
        enabled.EnsureSuccessStatusCode();
        Assert.True((await enabled.Content.ReadFromJsonAsync<RoleResponse>())!.ExtendsBaseRole);

        var disabled = await owner.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/roles/{role.Id}", new { extendsBaseRole = false });
        disabled.EnsureSuccessStatusCode();
        Assert.False((await disabled.Content.ReadFromJsonAsync<RoleResponse>())!.ExtendsBaseRole);

        var audit = await owner.GetFromJsonAsync<AuditResponse>($"/api/groups/{group.Id}/audit");
        Assert.Equal(3, audit!.Items.Count(row =>
            row.Action is GroupAuditEntry.ActionGroupRoleCreated or GroupAuditEntry.ActionGroupRoleUpdated));
    }

    [Fact]
    public async Task Assigned_role_from_another_group_fails_closed_instead_of_restoring_base_permissions()
    {
        var owner = await CreateAuthenticatedClientAsync("cross-role-owner@example.com");
        var memberGroup = await CreateGroupAsync(owner, "Member Role Group");
        var roleGroup = await CreateGroupAsync(owner, "Role Definition Group");
        var songResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{memberGroup.Id}/songs", new { title = "Restricted song", originKind = "original" });
        songResponse.EnsureSuccessStatusCode();
        var memberId = await CreateMemberAsync(
            memberGroup.Id, MembershipRoles.Manager, "cross-role-member@example.com");

        var createRole = await owner.PostAsJsonAsync($"/api/groups/{roleGroup.Id}/roles", new
        {
            name = "External role",
            permissions = Array.Empty<string>(),
            extendsBaseRole = true
        });
        createRole.EnsureSuccessStatusCode();
        var foreignRole = (await createRole.Content.ReadFromJsonAsync<RoleResponse>())!;

        // Simulate a corrupt/out-of-band assignment. Public assignment endpoints
        // correctly reject this; authorization must still fail closed if bad
        // persisted state is encountered.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            var membership = db.Memberships.Single(m =>
                m.GroupId == memberGroup.Id && m.UserId == memberId);
            membership.AssignGroupRole(foreignRole.Id);
            await db.SaveChangesAsync();
        }

        var member = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(member);
        var login = await member.PostAsJsonAsync("/api/auth/login", new
        {
            email = "cross-role-member@example.com",
            password = "Password1",
            rememberMe = false
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(member);
        var visibleSongs = await member.GetFromJsonAsync<List<SongItem>>(
            $"/api/groups/{memberGroup.Id}/songs");
        Assert.Empty(visibleSongs!);
    }

    [Theory]
    [InlineData(GroupPermissions.ManageGroup)]
    [InlineData(GroupPermissions.ManageBranding)]
    [InlineData(GroupPermissions.ManageMembers)]
    [InlineData(GroupPermissions.ManageRoles)]
    [InlineData(GroupPermissions.EventDelete)]
    public async Task Custom_role_cannot_hold_unassignable_permissions(string permission)
    {
        var owner = await CreateAuthenticatedClientAsync($"adr78-escalate-{permission}@example.com");
        var group = await CreateGroupAsync(owner, "Escalation Band");

        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Sneaky role",
            permissions = new[] { permission }
        });
        Assert.Equal(HttpStatusCode.BadRequest, created.StatusCode);

        // The role was never persisted, so the member cannot be escalated.
        var roles = await owner.GetFromJsonAsync<RolesResponse>($"/api/groups/{group.Id}/roles");
        Assert.DoesNotContain(roles!.Items, r => r.Name == "Sneaky role");
    }

    [Fact]
    public async Task Custom_role_update_rejects_administrative_permissions()
    {
        var owner = await CreateAuthenticatedClientAsync("adr78-update@example.com");
        var group = await CreateGroupAsync(owner, "Update Band");

        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Content only",
            permissions = new[] { GroupPermissions.SongEdit }
        });
        created.EnsureSuccessStatusCode();
        var role = await created.Content.ReadFromJsonAsync<RoleResponse>();

        var update = await owner.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/roles/{role!.Id}",
            new { permissions = new[] { GroupPermissions.ManageMembers } });
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);

        var unchanged = await owner.GetFromJsonAsync<RolesResponse>($"/api/groups/{group.Id}/roles");
        Assert.Equal("song.edit", unchanged!.Items.Single(r => r.Id == role.Id).Permissions);
    }

    [Fact]
    public async Task Custom_role_cannot_be_created_with_an_unknown_permission()
    {
        var owner = await CreateAuthenticatedClientAsync("adr78-unknown@example.com");
        var group = await CreateGroupAsync(owner, "Unknown Band");

        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Bogus",
            permissions = new[] { "delete_everything" }
        });
        Assert.Equal(HttpStatusCode.BadRequest, created.StatusCode);
    }

    /// <summary>
    /// ADR-0082: the permission set is enforced per request, not just displayed.
    /// A plain Member cannot write content; the SAME member holding a custom
    /// role that grants the capability can. This is the proof that a custom role
    /// actually gates the server and is not UI decoration.
    /// </summary>
    [Fact]
    public async Task Custom_role_permission_is_enforced_on_a_real_endpoint()
    {
        var owner = await CreateAuthenticatedClientAsync("adr81-owner@example.com");
        var group = await CreateGroupAsync(owner, "Enforcement Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Member, "adr81-member@example.com");

        var member = await CreateAuthenticatedClientAsync("adr81-member@example.com");
        var withoutRole = await member.PostAsJsonAsync(
            $"/api/groups/{group.Id}/setlists", new { name = "Sin permiso" });
        Assert.Equal(HttpStatusCode.Forbidden, withoutRole.StatusCode);

        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Compositor",
            permissions = new[] { GroupPermissions.SetlistCreate }
        });
        created.EnsureSuccessStatusCode();
        var role = await created.Content.ReadFromJsonAsync<RoleResponse>();

        // Still forbidden before the role is granted.
        var stillDenied = await member.PostAsJsonAsync(
            $"/api/groups/{group.Id}/setlists", new { name = "Sigue sin permiso" });
        Assert.Equal(HttpStatusCode.Forbidden, stillDenied.StatusCode);

        var assign = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role", new { groupRoleId = role!.Id });
        Assert.Equal(HttpStatusCode.NoContent, assign.StatusCode);

        // Now the same member passes: the assigned profile grants this action.
        var allowed = await member.PostAsJsonAsync(
            $"/api/groups/{group.Id}/setlists", new { name = "Con permiso" });
        Assert.Equal(HttpStatusCode.Created, allowed.StatusCode);
    }

    /// <summary>
    /// An assigned profile replaces the base preset: capabilities omitted from
    /// the profile are withheld even when the base role would normally allow them.
    /// </summary>
    [Fact]
    public async Task Custom_role_only_grants_what_it_declares()
    {
        var owner = await CreateAuthenticatedClientAsync("adr81-scope-owner@example.com");
        var group = await CreateGroupAsync(owner, "Scope Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Manager, "adr81-scope-member@example.com");

        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Solo lee",
            permissions = new[] { GroupPermissions.SetlistView }
        });
        created.EnsureSuccessStatusCode();
        var role = await created.Content.ReadFromJsonAsync<RoleResponse>();

        await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role", new { groupRoleId = role!.Id });

        var member = await CreateAuthenticatedClientAsync("adr81-scope-member@example.com");
        var read = await member.GetAsync($"/api/groups/{group.Id}/songs");
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        var songs = await read.Content.ReadFromJsonAsync<List<SongItem>>();
        Assert.NotNull(songs);
        Assert.Empty(songs!);

        var setlists = await member.GetAsync($"/api/groups/{group.Id}/setlists");
        Assert.Equal(HttpStatusCode.OK, setlists.StatusCode);

        var write = await member.PostAsJsonAsync(
            $"/api/groups/{group.Id}/setlists", new { name = "No debo poder" });
        Assert.Equal(HttpStatusCode.Forbidden, write.StatusCode);
    }

    [Fact]
    public async Task Resource_edit_permission_does_not_grant_resource_delete()
    {
        var owner = await CreateAuthenticatedClientAsync("resource-edit-owner@example.com");
        var group = await CreateGroupAsync(owner, "Resource Edit Band");
        var memberId = await CreateMemberAsync(
            group.Id, MembershipRoles.Member, "resource-edit-member@example.com");

        var song = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs", new { title = "Song", originKind = "original" });
        song.EnsureSuccessStatusCode();
        var songId = (await song.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;
        var arrangement = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{songId}/arrangements", new { label = "Acoustic" });
        arrangement.EnsureSuccessStatusCode();
        var arrangementId = (await arrangement.Content.ReadFromJsonAsync<ArrangementIdResponse>())!.Id;
        var resource = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources",
            new { kind = "link", purpose = "other", label = "Reference", url = "https://example.com" });
        resource.EnsureSuccessStatusCode();
        var resourceId = (await resource.Content.ReadFromJsonAsync<ResourceIdResponse>())!.Id;

        var createdRole = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Resource metadata editor",
            permissions = new[] { GroupPermissions.ResourceEdit }
        });
        createdRole.EnsureSuccessStatusCode();
        var role = await createdRole.Content.ReadFromJsonAsync<RoleResponse>();
        var assignment = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role", new { groupRoleId = role!.Id });
        Assert.Equal(HttpStatusCode.NoContent, assignment.StatusCode);

        var member = await CreateAuthenticatedClientAsync("resource-edit-member@example.com");
        var edit = await member.PatchAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources/{resourceId}",
            new { label = "Updated reference" });
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);

        var delete = await member.DeleteAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources/{resourceId}");
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);
    }

    [Fact]
    public async Task Arrangement_read_does_not_include_resources_without_resource_read_access()
    {
        var owner = await CreateAuthenticatedClientAsync("arrangement-resource-read-owner@example.com");
        var group = await CreateGroupAsync(owner, "Separated Read Band");
        var memberId = await CreateMemberAsync(
            group.Id, MembershipRoles.Member, "arrangement-resource-read-member@example.com");

        var songResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs", new { title = "Song", originKind = "original" });
        songResponse.EnsureSuccessStatusCode();
        var songId = (await songResponse.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;
        var arrangementResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{songId}/arrangements", new { label = "Acoustic" });
        arrangementResponse.EnsureSuccessStatusCode();
        var arrangementId = (await arrangementResponse.Content.ReadFromJsonAsync<ArrangementIdResponse>())!.Id;
        var resourceResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources",
            new { kind = "link", purpose = "other", label = "Private reference", url = "https://example.com" });
        resourceResponse.EnsureSuccessStatusCode();

        var roleResponse = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Arrangement reader",
            permissions = new[] { GroupPermissions.ArrangementView }
        });
        roleResponse.EnsureSuccessStatusCode();
        var role = await roleResponse.Content.ReadFromJsonAsync<RoleResponse>();
        var assignment = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role",
            new { groupRoleId = role!.Id });
        Assert.Equal(HttpStatusCode.NoContent, assignment.StatusCode);

        var member = await CreateAuthenticatedClientAsync("arrangement-resource-read-member@example.com");
        var detail = await member.GetAsync($"/api/groups/{group.Id}/arrangements/{arrangementId}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        using var detailDocument = JsonDocument.Parse(await detail.Content.ReadAsStringAsync());
        Assert.Empty(detailDocument.RootElement.GetProperty("resources").EnumerateArray());

        var resourceList = await member.GetAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources");
        Assert.Equal(HttpStatusCode.Forbidden, resourceList.StatusCode);
    }

    /// <summary>
    /// The union rule never lets a custom role reach an administrative
    /// capability, even one that is not on the assignable list.
    /// </summary>
    [Fact]
    public async Task Custom_role_cannot_reach_an_administrative_capability()
    {
        var owner = await CreateAuthenticatedClientAsync("adr81-admin-owner@example.com");
        var group = await CreateGroupAsync(owner, "Admin Reach Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Member, "adr81-admin-member@example.com");

        var created = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Bibliotecario",
            permissions = new[] { GroupPermissions.SetlistCreate, GroupPermissions.SetlistDelete }
        });
        created.EnsureSuccessStatusCode();
        var role = await created.Content.ReadFromJsonAsync<RoleResponse>();
        await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role", new { groupRoleId = role!.Id });

        var member = await CreateAuthenticatedClientAsync("adr81-admin-member@example.com");

        // The granted content capability works...
        var setlist = await member.PostAsJsonAsync(
            $"/api/groups/{group.Id}/setlists", new { name = "Puedo crear" });
        Assert.Equal(HttpStatusCode.Created, setlist.StatusCode);

        // ...but the administrative one does not.
        var invite = await member.PostAsJsonAsync(
            $"/api/groups/{group.Id}/invitations", new { email = "alguien@example.com" });
        Assert.Equal(HttpStatusCode.Forbidden, invite.StatusCode);
    }

    /// <summary>
    /// ADR-0080: an explicit DENY removes access a role would otherwise give.
    /// A Manager can normally read every song; denying one makes it unreadable
    /// both by direct URL and absent from the index, so it does not leak.
    /// </summary>
    [Fact]
    public async Task An_explicit_deny_removes_access_the_role_would_give()
    {
        var owner = await CreateAuthenticatedClientAsync("adr83-deny-owner@example.com");
        var group = await CreateGroupAsync(owner, "Deny Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Manager, "adr83-deny-member@example.com");

        var manager = await CreateAuthenticatedClientAsync("adr83-deny-member@example.com");

        // Baseline: a Manager sees the songs and can open one.
        var before = await manager.GetAsync($"/api/groups/{group.Id}/songs");
        Assert.Equal(HttpStatusCode.OK, before.StatusCode);

        var song = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new { title = "Privada", originKind = "original" });
        song.EnsureSuccessStatusCode();
        var songId = (await song.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;

        var readableBefore = await manager.GetAsync($"/api/groups/{group.Id}/songs/{songId}");
        Assert.Equal(HttpStatusCode.OK, readableBefore.StatusCode);

        // Now deny it for this member only.
        var deny = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/resource-grants",
            new { resourceType = "song", resourceId = songId, granted = false });
        Assert.Equal(HttpStatusCode.NoContent, deny.StatusCode);

        // Gone from the index, and unreadable by direct URL.
        var index = await (await manager.GetAsync($"/api/groups/{group.Id}/songs"))
            .Content.ReadFromJsonAsync<List<SongItem>>();
        Assert.DoesNotContain(index!, item => item.Id == songId);

        var readableAfter = await manager.GetAsync($"/api/groups/{group.Id}/songs/{songId}");
        Assert.NotEqual(HttpStatusCode.OK, readableAfter.StatusCode);
    }

    /// <summary>
    /// ADR-0082: a specific read grant can open one item for a member whose
    /// assigned profile does not grant group-wide read.
    /// </summary>
    [Fact]
    public async Task An_explicit_allow_adds_access_the_role_would_not_give()
    {
        var owner = await CreateAuthenticatedClientAsync("adr83-allow-owner@example.com");
        var group = await CreateGroupAsync(owner, "Allow Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Viewer, "adr83-allow-member@example.com");

        var restrictedRoleResponse = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Solo repertorio",
            permissions = new[] { GroupPermissions.SetlistView }
        });
        restrictedRoleResponse.EnsureSuccessStatusCode();
        var restrictedRole = await restrictedRoleResponse.Content.ReadFromJsonAsync<RoleResponse>();
        var assignRole = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role",
            new { groupRoleId = restrictedRole!.Id });
        Assert.Equal(HttpStatusCode.NoContent, assignRole.StatusCode);

        var visible = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new { title = "Visible", originKind = "original" });
        visible.EnsureSuccessStatusCode();
        var visibleId = (await visible.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;
        var hidden = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new { title = "Oculta", originKind = "original" });
        hidden.EnsureSuccessStatusCode();
        var hiddenId = (await hidden.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;
        var arrangementResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{visibleId}/arrangements", new { label = "Acoustic" });
        arrangementResponse.EnsureSuccessStatusCode();
        var arrangementId = (await arrangementResponse.Content.ReadFromJsonAsync<ArrangementIdResponse>())!.Id;
        var resourceResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources",
            new { kind = "link", purpose = "other", label = "Reference", url = "https://example.com" });
        resourceResponse.EnsureSuccessStatusCode();
        var resourceId = (await resourceResponse.Content.ReadFromJsonAsync<ResourceIdResponse>())!.Id;

        var viewer = await CreateAuthenticatedClientAsync("adr83-allow-member@example.com");

        // The assigned profile removes group-wide song visibility.
        var beforeResponse = await viewer.GetAsync($"/api/groups/{group.Id}/songs");
        Assert.Equal(HttpStatusCode.OK, beforeResponse.StatusCode);
        var before = await beforeResponse.Content.ReadFromJsonAsync<List<SongItem>>();
        Assert.NotNull(before);
        Assert.Empty(before!);

        var allow = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/resource-grants",
            new { resourceType = "song", resourceId = visibleId, granted = true });
        Assert.Equal(HttpStatusCode.NoContent, allow.StatusCode);

        // The explicit grant exposes only its target; the other song stays hidden.
        var afterResponse = await viewer.GetAsync($"/api/groups/{group.Id}/songs");
        Assert.Equal(HttpStatusCode.OK, afterResponse.StatusCode);
        var after = await afterResponse.Content.ReadFromJsonAsync<List<SongItem>>();
        Assert.NotNull(after);
        Assert.Contains(after!, item => item.Id == visibleId);
        Assert.DoesNotContain(after, item => item.Id == hiddenId);

        var direct = await viewer.GetAsync($"/api/groups/{group.Id}/songs/{visibleId}");
        Assert.Equal(HttpStatusCode.OK, direct.StatusCode);
        var hiddenDirect = await viewer.GetAsync($"/api/groups/{group.Id}/songs/{hiddenId}");
        Assert.NotEqual(HttpStatusCode.OK, hiddenDirect.StatusCode);

        var arrangements = await viewer.GetAsync(
            $"/api/groups/{group.Id}/songs/{visibleId}/arrangements");
        Assert.Equal(HttpStatusCode.OK, arrangements.StatusCode);
        var arrangementDetail = await viewer.GetAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}");
        Assert.Equal(HttpStatusCode.OK, arrangementDetail.StatusCode);
        var resources = await viewer.GetAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources");
        Assert.Equal(HttpStatusCode.OK, resources.StatusCode);
        var resource = await viewer.GetAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources/{resourceId}");
        Assert.Equal(HttpStatusCode.OK, resource.StatusCode);
    }

    [Fact]
    public async Task An_arrangement_allow_adds_read_access_but_stays_inside_its_song()
    {
        var owner = await CreateAuthenticatedClientAsync("arrangement-grant-owner@example.com");
        var group = await CreateGroupAsync(owner, "Arrangement Grant Band");
        var memberId = await CreateMemberAsync(
            group.Id, MembershipRoles.Viewer, "arrangement-grant-member@example.com");

        var roleResponse = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roles", new
        {
            name = "Song reader",
            permissions = new[] { GroupPermissions.SongView }
        });
        roleResponse.EnsureSuccessStatusCode();
        var role = await roleResponse.Content.ReadFromJsonAsync<RoleResponse>();
        var assign = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/group-role",
            new { groupRoleId = role!.Id });
        Assert.Equal(HttpStatusCode.NoContent, assign.StatusCode);

        var songResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs", new { title = "Readable song", originKind = "original" });
        songResponse.EnsureSuccessStatusCode();
        var songId = (await songResponse.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;
        var otherSongResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs", new { title = "Other song", originKind = "original" });
        otherSongResponse.EnsureSuccessStatusCode();
        var otherSongId = (await otherSongResponse.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;
        var otherArrangementResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{otherSongId}/arrangements", new { label = "Other version" });
        otherArrangementResponse.EnsureSuccessStatusCode();
        var otherArrangementId = (await otherArrangementResponse.Content.ReadFromJsonAsync<ArrangementIdResponse>())!.Id;

        var arrangementResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{songId}/arrangements", new { label = "Acoustic" });
        arrangementResponse.EnsureSuccessStatusCode();
        var arrangementId = (await arrangementResponse.Content.ReadFromJsonAsync<ArrangementIdResponse>())!.Id;
        var resourceResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arrangementId}/resources",
            new { kind = "link", purpose = "other", label = "Reference", url = "https://example.com" });
        resourceResponse.EnsureSuccessStatusCode();
        var resourceId = (await resourceResponse.Content.ReadFromJsonAsync<ResourceIdResponse>())!.Id;

        var member = await CreateAuthenticatedClientAsync("arrangement-grant-member@example.com");
        var noArrangementPermission = await member.GetAsync($"/api/groups/{group.Id}/arrangements/{arrangementId}");
        Assert.NotEqual(HttpStatusCode.OK, noArrangementPermission.StatusCode);

        var allow = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/resource-grants",
            new { resourceType = "arrangement", resourceId = arrangementId, granted = true });
        Assert.Equal(HttpStatusCode.NoContent, allow.StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await member.GetAsync($"/api/groups/{group.Id}/arrangements/{arrangementId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await member.GetAsync($"/api/groups/{group.Id}/arrangements/{arrangementId}/resources/{resourceId}")).StatusCode);
        var otherArrangements = await member.GetAsync($"/api/groups/{group.Id}/songs/{otherSongId}/arrangements");
        Assert.Equal(HttpStatusCode.OK, otherArrangements.StatusCode);
        Assert.DoesNotContain(otherArrangementId.ToString(), await otherArrangements.Content.ReadAsStringAsync());
    }

    /// <summary>
    /// ADR-0080: a resource grant may never widen a WRITE capability. Asking to
    /// "allow" a song must be refused when it would imply more than a read, which
    /// is what keeps the resource layer from becoming an escalation path.
    /// </summary>
    [Fact]
    public async Task A_resource_grant_cannot_widen_a_write_capability()
    {
        var owner = await CreateAuthenticatedClientAsync("adr83-widen-owner@example.com");
        var group = await CreateGroupAsync(owner, "Widen Band");
        var memberId = await CreateMemberAsync(group.Id, MembershipRoles.Viewer, "adr83-widen-member@example.com");

        var song = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/songs", new { title = "Intocable", originKind = "original" });
        song.EnsureSuccessStatusCode();
        var songId = (await song.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;

        var viewer = await CreateAuthenticatedClientAsync("adr83-widen-member@example.com");

        // Even with an explicit ALLOW row on the item, a Viewer still cannot edit
        // it: only read access is grantable per resource.
        var allow = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberId}/resource-grants",
            new { resourceType = "song", resourceId = songId, granted = true });
        allow.EnsureSuccessStatusCode();

        var audit = await owner.GetFromJsonAsync<AuditResponse>($"/api/groups/{group.Id}/audit");
        Assert.Contains(audit!.Items, row =>
            row.Action == GroupAuditEntry.ActionResourceGrantChanged
            && row.TargetUserId == memberId
            && row.Metadata == $"resourceType=song;resourceId={songId:D};access=allow");

        var write = await viewer.PutAsJsonAsync(
            $"/api/groups/{group.Id}/songs/{songId}",
            new { title = "Renombrada", expectedVersion = 1 });
        Assert.NotEqual(HttpStatusCode.OK, write.StatusCode);
    }

    [Fact]
    public async Task Reports_are_owner_only_and_rsvp_counts_are_not_called_attendance()
    {
        var owner = await CreateAuthenticatedClientAsync("reports-owner@example.com");
        var group = await CreateGroupAsync(owner, "Reports Band");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            await db.Memberships.AddAsync(
                Membership.CreatePerson(group.Id, "Persona del roster sin cuenta", DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        }

        var songResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/songs", new { title = "Canción de prueba", originKind = "original" });
        Assert.Equal(HttpStatusCode.Created, songResponse.StatusCode);

        var eventResponse = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/events",
            new { title = "Ensayo", type = "rehearsal", startsAt = DateTimeOffset.UtcNow.AddDays(2) });
        Assert.Equal(HttpStatusCode.Created, eventResponse.StatusCode);
        var musicalEvent = (await eventResponse.Content.ReadFromJsonAsync<EventResponse>())!;

        var rsvp = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/events/{musicalEvent.Id}/rsvp", new { response = "yes" });
        Assert.Equal(HttpStatusCode.OK, rsvp.StatusCode);

        var taskCreatedAt = DateTimeOffset.UtcNow;
        var taskCreate = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/tasks",
            new { title = "Task report open", notes = (string?)null, dueAt = taskCreatedAt.AddDays(-1), assigneeUserId = (Guid?)null });
        Assert.Equal(HttpStatusCode.Created, taskCreate.StatusCode);
        var setlistCreate = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/setlists", new { name = "Setlist report" });
        Assert.Equal(HttpStatusCode.Created, setlistCreate.StatusCode);

        var repertoireResponse = await owner.GetAsync($"/api/groups/{group.Id}/reports/repertoire");
        var repertoireBody = await repertoireResponse.Content.ReadAsStringAsync();
        Assert.True(repertoireResponse.StatusCode == HttpStatusCode.OK, repertoireBody);
        var repertoire = JsonSerializer.Deserialize<RepertoireReportResponse>(
            repertoireBody, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(repertoire);
        Assert.Equal(1, repertoire!.Songs);
        Assert.Equal(0, repertoire.Arrangements);

        var from = DateTimeOffset.UtcNow.AddDays(-1);
        var to = DateTimeOffset.UtcNow.AddDays(7);
        var eventReport = await owner.GetFromJsonAsync<EventResponseReportResponse>(
            $"/api/groups/{group.Id}/reports/event-responses?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}");
        Assert.NotNull(eventReport);
        Assert.Equal(1, eventReport!.Members);
        var row = Assert.Single(eventReport.Events);
        Assert.Equal(musicalEvent.Id, row.EventId);
        Assert.Equal(1, row.Yes);
        Assert.Equal(0, row.NoResponse);

        var taskFrom = taskCreatedAt.AddDays(-1);
        var taskTo = taskCreatedAt.AddDays(1);
        var taskReport = await owner.GetFromJsonAsync<TaskReportResponse>(
            $"/api/groups/{group.Id}/reports/tasks?from={Uri.EscapeDataString(taskFrom.ToString("O"))}&to={Uri.EscapeDataString(taskTo.ToString("O"))}");
        Assert.NotNull(taskReport);
        Assert.Equal(1, taskReport!.Total);
        Assert.Equal(1, taskReport.Open);
        Assert.Equal(1, taskReport.Unassigned);
        Assert.Equal(1, taskReport.Overdue);
        Assert.Empty(taskReport.ByAssignee);

        var setlistReport = await owner.GetFromJsonAsync<SetlistUsageReportResponse>(
            $"/api/groups/{group.Id}/reports/setlist-usage");
        Assert.NotNull(setlistReport);
        Assert.Equal(1, setlistReport!.Setlists);
        Assert.Equal(0, setlistReport.ArrangementReferences);

        var formulaTitleEvent = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/events",
            new { title = "=1+1", type = "rehearsal", startsAt = DateTimeOffset.UtcNow.AddDays(3) });
        Assert.Equal(HttpStatusCode.Created, formulaTitleEvent.StatusCode);

        var csvResponse = await owner.GetAsync(
            $"/api/groups/{group.Id}/reports/event-responses.csv?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}");
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        Assert.Contains("text/csv", csvResponse.Content.Headers.ContentType?.MediaType);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("event_id,title,event_type,starts_at_utc", csv);
        Assert.Contains("Ensayo", csv);
        Assert.Contains("\"'=1+1\"", csv);

        var auditResponse = await owner.GetStringAsync(
            $"/api/groups/{group.Id}/audit?action={GroupAuditEntry.ActionGroupReportExported}");
        Assert.Contains(GroupAuditEntry.ActionGroupReportExported, auditResponse);

        var member = await CreateMemberClientAsync(group.Id, MembershipRoles.Viewer, "reports-viewer@example.com");
        var denied = await member.GetAsync($"/api/groups/{group.Id}/reports/repertoire");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await member.GetAsync($"/api/groups/{group.Id}/reports/tasks?from={Uri.EscapeDataString(taskFrom.ToString("O"))}&to={Uri.EscapeDataString(taskTo.ToString("O"))}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await member.GetAsync($"/api/groups/{group.Id}/reports/setlist-usage")).StatusCode);
        var deniedExport = await member.GetAsync(
            $"/api/groups/{group.Id}/reports/event-responses.csv?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}");
        Assert.Equal(HttpStatusCode.Forbidden, deniedExport.StatusCode);

        var outsider = await CreateAuthenticatedClientAsync("reports-outsider@example.com");
        var hidden = await outsider.GetAsync($"/api/groups/{group.Id}/reports/repertoire");
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);

        var invalidRange = await owner.GetAsync(
            $"/api/groups/{group.Id}/reports/event-responses?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(from.AddDays(367).ToString("O"))}");
        Assert.Equal(HttpStatusCode.BadRequest, invalidRange.StatusCode);
        var invalidTaskRange = await owner.GetAsync(
            $"/api/groups/{group.Id}/reports/tasks?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(from.AddDays(367).ToString("O"))}");
        Assert.Equal(HttpStatusCode.BadRequest, invalidTaskRange.StatusCode);

        var emptyGroup = await CreateGroupAsync(owner, "Empty Reports Band");
        var emptyRepertoire = await owner.GetFromJsonAsync<RepertoireReportResponse>(
            $"/api/groups/{emptyGroup.Id}/reports/repertoire");
        Assert.NotNull(emptyRepertoire);
        Assert.Equal(0, emptyRepertoire!.Songs);
        Assert.Equal(0, emptyRepertoire.Arrangements);
        Assert.Empty(emptyRepertoire.ResourcesByPurpose);

        var emptyEvents = await owner.GetFromJsonAsync<EventResponseReportResponse>(
            $"/api/groups/{emptyGroup.Id}/reports/event-responses?from={Uri.EscapeDataString(from.ToString("O"))}&to={Uri.EscapeDataString(to.ToString("O"))}");
        Assert.NotNull(emptyEvents);
        Assert.Empty(emptyEvents!.Events);
        var emptyTasks = await owner.GetFromJsonAsync<TaskReportResponse>(
            $"/api/groups/{emptyGroup.Id}/reports/tasks?from={Uri.EscapeDataString(taskFrom.ToString("O"))}&to={Uri.EscapeDataString(taskTo.ToString("O"))}");
        Assert.NotNull(emptyTasks);
        Assert.Equal(0, emptyTasks!.Total);
        var emptySetlists = await owner.GetFromJsonAsync<SetlistUsageReportResponse>(
            $"/api/groups/{emptyGroup.Id}/reports/setlist-usage");
        Assert.NotNull(emptySetlists);
        Assert.Equal(0, emptySetlists!.Setlists);
        Assert.Equal(0, emptySetlists.ArrangementReferences);
    }

    [Fact]
    public async Task Group_access_can_be_disabled_and_restored_without_affecting_other_groups()
    {
        var owner = await CreateAuthenticatedClientAsync("member-access-owner@example.com");
        var groupA = await CreateGroupAsync(owner, "Member Access A");
        var groupB = await CreateGroupAsync(owner, "Member Access B");
        var memberId = await CreateMemberAsync(groupA.Id, MembershipRoles.Member, "member-access-target@example.com");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            db.Memberships.Add(Membership.CreateMember(groupB.Id, memberId, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        }
        var member = await CreateAuthenticatedClientAsync("member-access-target@example.com");

        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/groups/{groupA.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/groups/{groupB.Id}")).StatusCode);

        var missingValue = await owner.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{memberId}/access", new { });
        Assert.Equal(HttpStatusCode.BadRequest, missingValue.StatusCode);

        var disable = await owner.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{memberId}/access", new { enabled = false });
        Assert.Equal(HttpStatusCode.NoContent, disable.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await member.GetAsync($"/api/groups/{groupA.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/groups/{groupB.Id}")).StatusCode);

        var memberList = await owner.GetFromJsonAsync<MembersResponse>($"/api/groups/{groupA.Id}/members");
        Assert.NotNull(memberList);
        Assert.False(memberList!.Items.Single(item => item.UserId == memberId).AccessEnabled);
        var audit = await owner.GetStringAsync(
            $"/api/groups/{groupA.Id}/audit?action={GroupAuditEntry.ActionMemberAccessDisabled}");
        Assert.Contains(GroupAuditEntry.ActionMemberAccessDisabled, audit);

        var restore = await owner.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{memberId}/access", new { enabled = true });
        Assert.Equal(HttpStatusCode.NoContent, restore.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/groups/{groupA.Id}")).StatusCode);

        var managerId = await CreateMemberAsync(groupA.Id, MembershipRoles.Manager, "member-access-manager@example.com");
        Assert.NotEqual(Guid.Empty, managerId);
        var manager = await CreateAuthenticatedClientAsync("member-access-manager@example.com");
        var managerAttempt = await manager.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{memberId}/access", new { enabled = false });
        Assert.Equal(HttpStatusCode.Forbidden, managerAttempt.StatusCode);

        var ownerInfo = await owner.GetFromJsonAsync<JsonElement>("/api/auth/me");
        var ownerUserId = ownerInfo.GetProperty("id").GetGuid();
        var ownerDisable = await owner.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{ownerUserId}/access", new { enabled = false });
        Assert.Equal(HttpStatusCode.Conflict, ownerDisable.StatusCode);
    }

    /// <summary>
    /// ADR-0080: grants are scoped to (GroupId, UserId). A grant in one group
    /// must never affect the same user in another group.
    /// </summary>
    [Fact]
    public async Task A_resource_grant_does_not_leak_across_groups()
    {
        var owner = await CreateAuthenticatedClientAsync("adr83-scope-owner@example.com");
        var groupA = await CreateGroupAsync(owner, "Scope A");
        var groupB = await CreateGroupAsync(owner, "Scope B");

        var memberA = await CreateMemberAsync(groupA.Id, MembershipRoles.Viewer, "adr83-scope-member-a@example.com");
        var memberB = await CreateMemberAsync(groupB.Id, MembershipRoles.Viewer, "adr83-scope-member-b@example.com");

        var songA = await owner.PostAsJsonAsync($"/api/groups/{groupA.Id}/songs", new { title = "En A", originKind = "original" });
        songA.EnsureSuccessStatusCode();
        var songAId = (await songA.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;

        var songB = await owner.PostAsJsonAsync($"/api/groups/{groupB.Id}/songs", new { title = "En B", originKind = "original" });
        songB.EnsureSuccessStatusCode();
        var songBId = (await songB.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;

        // Allow the song in group A for member A only.
        var allow = await owner.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{memberA}/resource-grants",
            new { resourceType = "song", resourceId = songAId, granted = true });
        allow.EnsureSuccessStatusCode();

        var clientA = await CreateAuthenticatedClientAsync("adr83-scope-member-a@example.com");
        var clientB = await CreateAuthenticatedClientAsync("adr83-scope-member-b@example.com");

        // Member A sees exactly what was granted to them, in their group.
        var inA = await clientA.GetAsync($"/api/groups/{groupA.Id}/songs/{songAId}");
        Assert.Equal(HttpStatusCode.OK, inA.StatusCode);

        // Member B is a different person in a different group: the grant never
        // reaches them, and neither does the item.
        var inB = await clientB.GetAsync($"/api/groups/{groupB.Id}/songs/{songBId}");
        Assert.Equal(HttpStatusCode.OK, inB.StatusCode);

        // The grant made for member A in group A does not travel to group B.
        var crossGroup = await clientA.GetAsync($"/api/groups/{groupB.Id}/songs/{songBId}");
        Assert.Equal(HttpStatusCode.NotFound, crossGroup.StatusCode);
    }

    [Fact]
    public async Task Manager_cannot_change_another_members_resource_permissions()
    {
        var owner = await CreateAuthenticatedClientAsync("resource-grant-manager-owner@example.com");
        var group = await CreateGroupAsync(owner, "Resource Grant Manager Band");
        var managerId = await CreateMemberAsync(
            group.Id,
            MembershipRoles.Manager,
            "resource-grant-manager@example.com");
        var targetId = await CreateMemberAsync(
            group.Id,
            MembershipRoles.Member,
            "resource-grant-target@example.com");

        var manager = await CreateAuthenticatedClientAsync("resource-grant-manager@example.com");
        var response = await manager.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{targetId}/resource-grants",
            new { resourceType = "song", resourceId = Guid.NewGuid(), granted = false });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.NotEqual(Guid.Empty, managerId);
    }

    [Fact]
    public async Task Resource_grants_cannot_be_read_for_a_non_member_target()
    {
        var owner = await CreateAuthenticatedClientAsync("resource-grant-target-owner@example.com");
        var group = await CreateGroupAsync(owner, "Resource Grant Target Band");

        var response = await owner.GetAsync(
            $"/api/groups/{group.Id}/members/{Guid.NewGuid()}/resource-grants");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Resource_grants_cannot_be_changed_for_a_non_member_target()
    {
        var owner = await CreateAuthenticatedClientAsync("resource-grant-write-target-owner@example.com");
        var group = await CreateGroupAsync(owner, "Resource Grant Write Target Band");

        var response = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{Guid.NewGuid()}/resource-grants",
            new { resourceType = "song", resourceId = Guid.NewGuid(), granted = false });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Resource_grants_cannot_target_a_song_outside_the_group()
    {
        var owner = await CreateAuthenticatedClientAsync("resource-grant-song-owner@example.com");
        var groupA = await CreateGroupAsync(owner, "Resource Grant Song A");
        var groupB = await CreateGroupAsync(owner, "Resource Grant Song B");
        var targetId = await CreateMemberAsync(
            groupA.Id, MembershipRoles.Member, "resource-grant-song-target@example.com");

        var songInGroupB = await owner.PostAsJsonAsync(
            $"/api/groups/{groupB.Id}/songs", new { title = "Otra banda", originKind = "original" });
        songInGroupB.EnsureSuccessStatusCode();
        var songId = (await songInGroupB.Content.ReadFromJsonAsync<SongIdResponse>())!.Id;

        var arrangementInGroupB = await owner.PostAsJsonAsync(
            $"/api/groups/{groupB.Id}/songs/{songId}/arrangements", new { label = "Otra versión" });
        arrangementInGroupB.EnsureSuccessStatusCode();
        var arrangementId = (await arrangementInGroupB.Content.ReadFromJsonAsync<ArrangementIdResponse>())!.Id;
        var resourceInGroupB = await owner.PostAsJsonAsync(
            $"/api/groups/{groupB.Id}/arrangements/{arrangementId}/resources",
            new { kind = "link", purpose = "other", label = "Referencia", url = "https://example.com" });
        resourceInGroupB.EnsureSuccessStatusCode();
        var resourceId = (await resourceInGroupB.Content.ReadFromJsonAsync<ResourceIdResponse>())!.Id;

        var crossGroupGrant = await owner.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{targetId}/resource-grants",
            new { resourceType = "song", resourceId = songId, granted = false });
        Assert.Equal(HttpStatusCode.NotFound, crossGroupGrant.StatusCode);

        var crossGroupArrangementGrant = await owner.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{targetId}/resource-grants",
            new { resourceType = "arrangement", resourceId = arrangementId, granted = false });
        Assert.Equal(HttpStatusCode.NotFound, crossGroupArrangementGrant.StatusCode);

        var crossGroupResourceGrant = await owner.PutAsJsonAsync(
            $"/api/groups/{groupA.Id}/members/{targetId}/resource-grants",
            new { resourceType = "resource", resourceId, granted = false });
        Assert.Equal(HttpStatusCode.NotFound, crossGroupResourceGrant.StatusCode);

        var grants = await owner.GetFromJsonAsync<ResourceGrantsResponse>(
            $"/api/groups/{groupA.Id}/members/{targetId}/resource-grants");
        Assert.Empty(grants!.Items);
    }

    [Fact]
    public async Task Resource_grants_cannot_be_assigned_to_the_group_owner()
    {
        var owner = await CreateAuthenticatedClientAsync("resource-grant-owner-target@example.com");
        var group = await CreateGroupAsync(owner, "Owner Target Band");
        var ownerId = await GetUserIdAsync("resource-grant-owner-target@example.com");

        var read = await owner.GetAsync(
            $"/api/groups/{group.Id}/members/{ownerId}/resource-grants");
        Assert.Equal(HttpStatusCode.BadRequest, read.StatusCode);

        var write = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{ownerId}/resource-grants",
            new { resourceType = "song", resourceId = Guid.NewGuid(), granted = false });
        Assert.Equal(HttpStatusCode.BadRequest, write.StatusCode);
    }

    private sealed record SongIdResponse(Guid Id);
    private sealed record ArrangementIdResponse(Guid Id);
    private sealed record ResourceIdResponse(Guid Id);


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
    private sealed record MemberRow(
        Guid UserId,
        string DisplayName,
        string Role,
        string? MusicalRole,
        Guid? GroupRoleId = null,
        bool AccessEnabled = true);
    private sealed record MembersResponse(List<MemberRow> Items);
    private sealed record AuditRow(Guid Id, string Action, Guid? ActorUserId, Guid? TargetUserId, string? Metadata);
    private sealed record AuditResponse(List<AuditRow> Items);
    private sealed record RoleResponse(Guid Id, string Name, string? Description, string Permissions, bool ExtendsBaseRole, bool IsSystem);
    private sealed record RolesResponse(List<RoleResponse> Items);
    private sealed record ResourceGrantsResponse(List<ResourceGrantResponse> Items);
    private sealed record ResourceGrantResponse(Guid Id, string ResourceType, Guid ResourceId, bool Granted);
    private sealed record SongItem(Guid Id, string Title);
    private sealed record RepertoireReportResponse(
        long Songs,
        long Arrangements,
        long Files,
        long Links,
        List<ResourcePurposeReportCount> ResourcesByPurpose);
    private sealed record ResourcePurposeReportCount(string Purpose, long Count);
    private sealed record EventResponseReportResponse(long Members, List<EventResponseReportRow> Events);
    private sealed record EventResponseReportRow(Guid EventId, string Title, string Type, DateTimeOffset StartsAt, long Yes, long No, long Maybe, long Responses, long NoResponse);
    private sealed record TaskReportResponse(DateTimeOffset From, DateTimeOffset To, DateTimeOffset AsOf, long Total, long Open, long InProgress, long Done, long Unassigned, long Overdue, List<TaskAssigneeReportRow> ByAssignee);
    private sealed record TaskAssigneeReportRow(Guid UserId, string DisplayName, long Count);
    private sealed record SetlistUsageReportResponse(DateTimeOffset AsOf, long Setlists, long ArrangementReferences);
}
