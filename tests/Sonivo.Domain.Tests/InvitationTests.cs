using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class InvitationTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-17T12:00:00Z");
    private const string TokenHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public void Create_sets_group_hash_creator_and_expiry()
    {
        var groupId = Guid.NewGuid();
        var creator = Guid.NewGuid();
        var expiresAt = Now.AddDays(7);

        var invitation = Invitation.Create(groupId, TokenHash, creator, Now, expiresAt);

        Assert.NotEqual(Guid.Empty, invitation.Id);
        Assert.Equal(groupId, invitation.GroupId);
        Assert.Equal(TokenHash, invitation.TokenHash);
        Assert.Equal(creator, invitation.CreatedByUserId);
        Assert.Equal(Now, invitation.CreatedAt);
        Assert.Equal(expiresAt, invitation.ExpiresAt);
        Assert.Null(invitation.AcceptedAt);
        Assert.Null(invitation.AcceptedByUserId);
        Assert.False(invitation.IsAccepted);
        Assert.False(invitation.IsExpired(Now));
        Assert.True(invitation.IsExpired(expiresAt));
    }

    [Fact]
    public void Create_rejects_empty_ids_or_blank_hash()
    {
        var groupId = Guid.NewGuid();
        var creator = Guid.NewGuid();
        var expiresAt = Now.AddDays(7);

        Assert.Throws<ArgumentException>(() =>
            Invitation.Create(Guid.Empty, TokenHash, creator, Now, expiresAt));
        Assert.Throws<ArgumentException>(() =>
            Invitation.Create(groupId, "  ", creator, Now, expiresAt));
        Assert.Throws<ArgumentException>(() =>
            Invitation.Create(groupId, TokenHash, Guid.Empty, Now, expiresAt));
    }

    [Fact]
    public void Accept_records_member_once()
    {
        var invitation = Invitation.Create(
            Guid.NewGuid(), TokenHash, Guid.NewGuid(), Now, Now.AddDays(7));
        var invitee = Guid.NewGuid();

        invitation.Accept(invitee, Now.AddHours(1));

        Assert.True(invitation.IsAccepted);
        Assert.Equal(Now.AddHours(1), invitation.AcceptedAt);
        Assert.Equal(invitee, invitation.AcceptedByUserId);

        Assert.Throws<InvalidOperationException>(() =>
            invitation.Accept(Guid.NewGuid(), Now.AddHours(2)));
    }

    [Fact]
    public void EnsureCanRevoke_rejects_accepted_invite()
    {
        var invitation = Invitation.Create(
            Guid.NewGuid(), TokenHash, Guid.NewGuid(), Now, Now.AddDays(7));
        Assert.True(invitation.IsOutstanding(Now));
        invitation.EnsureCanRevoke();

        invitation.Accept(Guid.NewGuid(), Now.AddHours(1));
        Assert.False(invitation.IsOutstanding(Now.AddHours(1)));
        Assert.Throws<InvalidOperationException>(invitation.EnsureCanRevoke);
    }
}
