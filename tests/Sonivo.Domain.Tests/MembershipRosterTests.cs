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

    [Theory]
    [InlineData("ana", true)]
    [InlineData("ana.beat_1-2", true)]
    [InlineData("ab", false)]
    [InlineData("ANA", false)]
    [InlineData("ana!", false)]
    [InlineData("", false)]
    public void Handle_validation_follows_the_documented_allow_list(string handle, bool valid)
    {
        Assert.Equal(valid, MembershipHandles.IsValid(handle));
    }

    [Fact]
    public void Assign_handle_normalizes_and_rejects_invalid_values()
    {
        var membership = Membership.CreatePerson(Guid.NewGuid(), "Ana", Now);

        membership.AssignHandle("  Ana.Perc  ");
        Assert.Equal("ana.perc", membership.Handle);

        Assert.Throws<ArgumentException>(() => membership.AssignHandle("no way"));
    }

    [Fact]
    public void Derive_handle_folds_accents_and_respects_bounds()
    {
        var handle = MembershipHandles.Derive("  José  Pérez  ");

        Assert.True(MembershipHandles.IsValid(handle));
        Assert.Equal("jose-perez", handle);

        var longName = new string('a', 80);
        Assert.True(MembershipHandles.IsValid(MembershipHandles.Derive(longName)));

        var shortName = MembershipHandles.Derive("X");
        Assert.True(MembershipHandles.IsValid(shortName));
    }

    [Fact]
    public void With_suffix_keeps_the_handle_within_the_maximum_length()
    {
        var handle = MembershipHandles.Derive(new string('b', 40));
        var suffixed = MembershipHandles.WithSuffix(handle, 12);

        Assert.True(MembershipHandles.IsValid(suffixed));
        Assert.EndsWith("-12", suffixed);
    }
}
