using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class MembershipRosterTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-01T12:00:00Z");

    [Fact]
    public void Roster_person_has_no_access_and_is_a_member()
    {
        var groupId = Guid.NewGuid();

        var person = Membership.CreatePerson(groupId, "  Ana  ", Now);

        Assert.Null(person.UserId);
        Assert.False(person.HasAccess);
        Assert.Equal(MembershipRoles.Member, person.Role);
        Assert.Equal("Ana", person.DisplayName);
        Assert.Equal(groupId, person.GroupId);
    }

    [Fact]
    public void Roster_person_cannot_be_promoted_to_owner_without_an_account()
    {
        var person = Membership.CreatePerson(Guid.NewGuid(), "Ana", Now);

        Assert.Throws<ArgumentException>(() => person.AssignRole(MembershipRoles.Owner));
    }

    [Fact]
    public void Claiming_an_account_grants_access_and_allows_owner()
    {
        var person = Membership.CreatePerson(Guid.NewGuid(), "Ana", Now);
        var userId = Guid.NewGuid();

        person.ClaimAccount(userId);
        person.AssignRole(MembershipRoles.Owner);

        Assert.Equal(userId, person.UserId);
        Assert.True(person.HasAccess);
        Assert.True(person.IsOwner);
    }

    [Fact]
    public void Members_created_with_an_account_have_access()
    {
        var membership = Membership.CreateMember(Guid.NewGuid(), Guid.NewGuid(), Now);

        Assert.True(membership.HasAccess);
        Assert.Equal(MembershipRoles.Member, membership.Role);
    }
}
