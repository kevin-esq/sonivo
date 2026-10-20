using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

/// <summary>
/// ADR-0082: a custom role is an explicit permission profile for non-owner
/// members. It can replace the base permission preset but cannot carry
/// administrative capabilities, which would let a member escalate.
/// </summary>
public class GroupRoleTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-14T12:00:00Z");

    [Fact]
    public void Create_accepts_the_assignable_permissions()
    {
        var role = GroupRole.Create(
            Guid.NewGuid(),
            "Setlist editor",
            Now,
            [GroupPermissions.SetlistEdit, GroupPermissions.SongEdit],
            "Can edit the repertoire");

        Assert.Equal(["setlist.edit", "song.edit"], role.PermissionList);
        Assert.False(role.IsSystem);
        Assert.False(role.ExtendsBaseRole);
    }

    [Fact]
    public void Legacy_event_delete_is_known_but_cannot_be_assigned_to_new_custom_roles()
    {
        Assert.True(GroupPermissions.IsKnown(GroupPermissions.EventDelete));
        Assert.False(GroupPermissions.IsAssignable(GroupPermissions.EventDelete));

        Assert.Throws<ArgumentException>(() => GroupRole.Create(
            Guid.NewGuid(),
            "Legacy delete",
            Now,
            [GroupPermissions.EventDelete]));
    }

    [Fact]
    public void Legacy_permission_mode_can_be_enabled_and_converted_back_to_exact()
    {
        var role = GroupRole.Create(
            Guid.NewGuid(), "Legacy", Now, [GroupPermissions.SongView], extendsBaseRole: true);

        Assert.True(role.ExtendsBaseRole);
        role.SetExtendsBaseRole(false);
        Assert.False(role.ExtendsBaseRole);
    }

    [Fact]
    public void System_roles_cannot_change_permission_mode()
    {
        var role = GroupRole.CreateSystem(Guid.NewGuid(), GroupRole.SystemManager, Now);

        Assert.Throws<InvalidOperationException>(() => role.SetExtendsBaseRole(true));
    }

    [Theory]
    [InlineData(GroupPermissions.ManageGroup)]
    [InlineData(GroupPermissions.ManageBranding)]
    [InlineData(GroupPermissions.ManageMembers)]
    [InlineData(GroupPermissions.ManageRoles)]
    public void Create_rejects_administrative_permissions(string permission)
    {
        var ex = Assert.Throws<ArgumentException>(() => GroupRole.Create(
            Guid.NewGuid(),
            "Sneaky role",
            Now,
            [permission]));

        Assert.Contains(permission, ex.Message);
    }

    [Fact]
    public void Create_rejects_an_unknown_permission()
    {
        Assert.Throws<ArgumentException>(() => GroupRole.Create(
            Guid.NewGuid(),
            "Bogus role",
            Now,
            ["delete_everything"]));
    }

    [Fact]
    public void CreateSystem_carries_no_permissions()
    {
        var role = GroupRole.CreateSystem(Guid.NewGuid(), GroupRole.SystemManager, Now);

        Assert.True(role.IsSystem);
        Assert.Empty(role.PermissionList);
    }

    [Fact]
    public void SetPermissions_rejects_administrative_permissions()
    {
        var role = GroupRole.Create(Guid.NewGuid(), "Custom", Now, [GroupPermissions.SongEdit]);

        Assert.Throws<ArgumentException>(() => role.SetPermissions([GroupPermissions.ManageGroup]));
    }

    [Fact]
    public void SetPermissions_applies_assignable_permissions()
    {
        var role = GroupRole.Create(Guid.NewGuid(), "Custom", Now, [GroupPermissions.SongEdit]);

        role.SetPermissions([GroupPermissions.EventRespondRsvp, GroupPermissions.Practice]);

        Assert.Equal(["event.rsvp.respond", "practice"], role.PermissionList);
    }

    [Fact]
    public void Assignable_and_administrative_permissions_do_not_overlap()
    {
        var administrative = new[]
        {
            GroupPermissions.ManageGroup,
            GroupPermissions.ManageBranding,
            GroupPermissions.ManageMembers,
            GroupPermissions.ManageRoles,
        };

        foreach (var permission in administrative)
        {
            Assert.False(GroupPermissions.IsAssignable(permission), permission);
            Assert.True(GroupPermissions.IsKnown(permission), permission);
        }
    }

    [Fact]
    public void Manager_does_not_receive_owner_administration_permissions()
    {
        var managerPermissions = GroupPermissions.BaseRolePermissions(GroupRole.SystemManager);

        foreach (var permission in GroupPermissions.OwnerOnly)
        {
            Assert.DoesNotContain(permission, managerPermissions);
        }
    }

    [Fact]
    public void Manager_does_not_receive_retired_event_hard_delete_permission()
    {
        var managerPermissions = GroupPermissions.BaseRolePermissions(GroupRole.SystemManager);

        Assert.DoesNotContain(GroupPermissions.EventDelete, managerPermissions);
    }

    [Fact]
    public void Resource_edit_and_delete_are_independent_manager_capabilities()
    {
        var managerPermissions = GroupPermissions.BaseRolePermissions(GroupRole.SystemManager);
        var viewerPermissions = GroupPermissions.BaseRolePermissions(GroupRole.SystemViewer);

        Assert.Contains(GroupPermissions.ResourceEdit, managerPermissions);
        Assert.Contains(GroupPermissions.ResourceDelete, managerPermissions);
        Assert.DoesNotContain(GroupPermissions.ResourceEdit, viewerPermissions);
        Assert.DoesNotContain(GroupPermissions.ResourceDelete, viewerPermissions);
        Assert.Contains(GroupPermissions.ResourceView, GroupPermissions.Expand([GroupPermissions.ResourceEdit]));
    }

    [Fact]
    public void Permission_dependencies_add_only_the_declared_parent_capabilities()
    {
        var expanded = GroupPermissions.Expand([GroupPermissions.ArrangementCreate]);

        Assert.Contains(GroupPermissions.ArrangementCreate, expanded);
        Assert.Contains(GroupPermissions.SongView, expanded);
        Assert.DoesNotContain(GroupPermissions.ArrangementView, expanded);
        Assert.DoesNotContain(GroupPermissions.SongEdit, expanded);
    }
}
