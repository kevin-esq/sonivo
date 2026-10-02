using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class MembershipTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-17T12:00:00Z");

    [Fact]
    public void AssignRole_owner_to_member_changes_role()
    {
        var membership = Membership.CreateOwner(Guid.NewGuid(), Guid.NewGuid(), Now);
        membership.AssignRole(MembershipRoles.Member);
        Assert.Equal(MembershipRoles.Member, membership.Role);
        Assert.False(membership.IsOwner);
    }

    [Fact]
    public void AssignRole_rejects_unknown_role()
    {
        var membership = Membership.CreateMember(Guid.NewGuid(), Guid.NewGuid(), Now);
        Assert.Throws<ArgumentException>(() => membership.AssignRole("Guest"));
    }

    [Theory]
    [InlineData(MembershipRoles.Owner, true, true)]
    [InlineData(MembershipRoles.Manager, true, true)]
    [InlineData(MembershipRoles.Member, false, true)]
    [InlineData(MembershipRoles.Viewer, false, false)]
    public void Section_permissions_follow_the_role(string role, bool canManage, bool canParticipate)
    {
        var membership = Membership.CreateMember(Guid.NewGuid(), Guid.NewGuid(), Now);
        membership.AssignRole(role);

        Assert.Equal(canManage, membership.CanManageContent);
        Assert.Equal(canParticipate, membership.CanParticipate);
        Assert.Equal(role == MembershipRoles.Viewer, membership.IsViewer);
    }

    [Fact]
    public void Musical_role_is_trimmed_cleared_and_bounded()
    {
        var membership = Membership.CreateMember(Guid.NewGuid(), Guid.NewGuid(), Now);

        membership.SetMusicalRole("  Bajo  ");
        Assert.Equal("Bajo", membership.MusicalRole);

        membership.SetMusicalRole("   ");
        Assert.Null(membership.MusicalRole);

        Assert.Throws<ArgumentException>(
            () => membership.SetMusicalRole(new string('x', Membership.MusicalRoleMaxLength + 1)));
    }

    [Fact]
    public void Group_audit_entry_keeps_ids_and_truncates_metadata()
    {
        var entry = GroupAuditEntry.Create(
            Guid.NewGuid(),
            GroupAuditEntry.ActionRoleChanged,
            Now,
            actorUserId: Guid.NewGuid(),
            targetUserId: Guid.NewGuid(),
            metadata: new string('x', 300));

        Assert.Equal(200, entry.Metadata!.Length);
        Assert.NotEqual(Guid.Empty, entry.Id);
    }
}
