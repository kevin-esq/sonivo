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
}
