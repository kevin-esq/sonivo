using System.Security.Cryptography;
using System.Text;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

public class InvitationUseCaseTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-17T12:00:00Z");

    [Fact]
    public async Task Owner_create_stores_hash_not_plaintext()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var handler = InviteHandler(groups, invitations);

        var created = await handler.HandleAsync(
            new CreateInvitationCommand(owner, groupId),
            CancellationToken.None);

        Assert.NotEqual(Guid.Empty, created.Id);
        Assert.False(string.IsNullOrWhiteSpace(created.Token));
        Assert.False(created.Emailed);
        Assert.True(Convert.FromHexString(created.Token).Length >= 16);
        Assert.Equal(Now.AddDays(7), created.ExpiresAt);
        Assert.Single(invitations.Invitations);
        var stored = invitations.Invitations[0];
        Assert.Equal(created.Id, stored.Id);
        Assert.Equal(Sha256Hex(created.Token), stored.TokenHash);
        Assert.DoesNotContain(created.Token, stored.TokenHash, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(groupId, stored.GroupId);
        Assert.Equal(owner, stored.CreatedByUserId);
        Assert.Null(stored.AcceptedAt);
    }

    [Fact]
    public async Task Member_create_throws_forbidden()
    {
        var (groups, invitations, _, groupId, member) = await SeedOwnerAndMemberAsync();
        var handler = InviteHandler(groups, invitations);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.HandleAsync(new CreateInvitationCommand(member, groupId), CancellationToken.None));
        Assert.Empty(invitations.Invitations);
    }

    [Fact]
    public async Task Non_member_create_throws_not_found()
    {
        var (groups, invitations, _, groupId) = await SeedOwnerAsync();
        var handler = InviteHandler(groups, invitations);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(
                new CreateInvitationCommand(Guid.NewGuid(), groupId),
                CancellationToken.None));
        Assert.Empty(invitations.Invitations);
    }

    [Fact]
    public async Task Accept_success_creates_member_in_one_save()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var created = await InviteHandler(groups, invitations)
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);

        var invitee = Guid.NewGuid();
        var unitOfWork = new FakeUnitOfWork();
        var accepted = await new AcceptInvitationHandler(
                groups, invitations, unitOfWork, new FixedClock(Now.AddHours(1)))
            .HandleAsync(new AcceptInvitationCommand(invitee, created.Token), CancellationToken.None);

        Assert.Equal(groupId, accepted.GroupId);
        Assert.Equal(MembershipRoles.Member, accepted.Role);
        Assert.Equal(1, unitOfWork.SaveCount);
        var membership = groups.Memberships.Single(m => m.UserId == invitee);
        Assert.Equal(groupId, membership.GroupId);
        Assert.Equal(MembershipRoles.Member, membership.Role);
        Assert.True(invitations.Invitations[0].IsAccepted);
        Assert.Equal(invitee, invitations.Invitations[0].AcceptedByUserId);
    }

    [Fact]
    public async Task Accept_replay_throws_validation()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var created = await InviteHandler(groups, invitations)
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);

        var invitee = Guid.NewGuid();
        var unitOfWork = new FakeUnitOfWork();
        var handler = new AcceptInvitationHandler(
            groups, invitations, unitOfWork, new FixedClock(Now.AddHours(1)));
        await handler.HandleAsync(new AcceptInvitationCommand(invitee, created.Token), CancellationToken.None);

        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(new AcceptInvitationCommand(Guid.NewGuid(), created.Token), CancellationToken.None));
        Assert.Equal(1, unitOfWork.SaveCount);
        Assert.Single(groups.Memberships, m => m.UserId == invitee);
    }

    [Fact]
    public async Task Accept_already_member_throws_conflict()
    {
        var (groups, invitations, owner, groupId, member) = await SeedOwnerAndMemberAsync();
        var created = await InviteHandler(groups, invitations)
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);

        var unitOfWork = new FakeUnitOfWork();
        await Assert.ThrowsAsync<ConflictException>(() =>
            new AcceptInvitationHandler(groups, invitations, unitOfWork, new FixedClock(Now.AddHours(1)))
                .HandleAsync(new AcceptInvitationCommand(member, created.Token), CancellationToken.None));
        Assert.Equal(0, unitOfWork.SaveCount);
        Assert.False(invitations.Invitations[0].IsAccepted);
    }

    [Fact]
    public async Task Accept_expired_throws_validation()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var created = await InviteHandler(groups, invitations)
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);

        var unitOfWork = new FakeUnitOfWork();
        await Assert.ThrowsAsync<ValidationException>(() =>
            new AcceptInvitationHandler(groups, invitations, unitOfWork, new FixedClock(Now.AddDays(7)))
                .HandleAsync(new AcceptInvitationCommand(Guid.NewGuid(), created.Token), CancellationToken.None));
        Assert.Equal(0, unitOfWork.SaveCount);
        Assert.DoesNotContain(groups.Memberships, m => m.Role == MembershipRoles.Member);
    }

    [Fact]
    public async Task List_outstanding_omits_token_and_accepted()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var created = await InviteHandler(groups, invitations)
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);
        invitations.Invitations[0].Accept(Guid.NewGuid(), Now.AddHours(1));
        var second = await InviteHandler(groups, invitations, Now.AddMinutes(1))
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);

        var list = await new ListInvitationsHandler(
                new GroupAccessService(groups), invitations, new FixedClock(Now.AddMinutes(2)))
            .HandleAsync(new ListInvitationsQuery(owner, groupId), CancellationToken.None);

        Assert.Single(list.Items);
        Assert.Equal(second.Id, list.Items[0].Id);
        Assert.Equal(second.ExpiresAt, list.Items[0].ExpiresAt);
    }

    [Fact]
    public async Task Member_list_throws_forbidden()
    {
        var (groups, invitations, _, groupId, member) = await SeedOwnerAndMemberAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new ListInvitationsHandler(new GroupAccessService(groups), invitations, new FixedClock(Now))
                .HandleAsync(new ListInvitationsQuery(member, groupId), CancellationToken.None));
    }

    [Fact]
    public async Task Revoke_unused_removes_row()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var created = await InviteHandler(groups, invitations)
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);

        await new RevokeInvitationHandler(
                new GroupAccessService(groups), invitations, new FixedClock(Now.AddMinutes(1)))
            .HandleAsync(new RevokeInvitationCommand(owner, groupId, created.Id), CancellationToken.None);

        Assert.Empty(invitations.Invitations);
    }

    [Fact]
    public async Task Revoke_accepted_throws_conflict()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var created = await InviteHandler(groups, invitations)
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);
        invitations.Invitations[0].Accept(Guid.NewGuid(), Now.AddHours(1));

        await Assert.ThrowsAsync<ConflictException>(() =>
            new RevokeInvitationHandler(new GroupAccessService(groups), invitations, new FixedClock(Now.AddHours(2)))
                .HandleAsync(new RevokeInvitationCommand(owner, groupId, created.Id), CancellationToken.None));
        Assert.Single(invitations.Invitations);
    }

    [Fact]
    public async Task Member_create_with_invalid_email_still_throws_forbidden()
    {
        var (groups, invitations, _, groupId, member) = await SeedOwnerAndMemberAsync();
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            InviteHandler(groups, invitations)
                .HandleAsync(new CreateInvitationCommand(member, groupId, "not-an-email"), CancellationToken.None));
        Assert.Empty(invitations.Invitations);
    }

    [Fact]
    public async Task Create_without_email_does_not_send()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var sender = new CapturingEmailSender();
        var created = await InviteHandler(groups, invitations, email: sender)
            .HandleAsync(new CreateInvitationCommand(owner, groupId), CancellationToken.None);

        Assert.False(created.Emailed);
        Assert.Empty(sender.Sent);
        Assert.Single(invitations.Invitations);
    }

    [Fact]
    public async Task Create_with_email_sends_join_link_when_configured()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var sender = new CapturingEmailSender();
        var created = await InviteHandler(groups, invitations, email: sender)
            .HandleAsync(
                new CreateInvitationCommand(owner, groupId, "singer@example.com"),
                CancellationToken.None);

        Assert.True(created.Emailed);
        Assert.Single(sender.Sent);
        Assert.Equal("singer@example.com", sender.Sent[0].To);
        Assert.Contains(created.Token, sender.Sent[0].TextBody, StringComparison.Ordinal);
        Assert.Contains("/join/", sender.Sent[0].TextBody, StringComparison.Ordinal);
        Assert.Contains("Band", sender.Sent[0].Subject, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Create_with_email_when_not_configured_still_creates_invite()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var created = await InviteHandler(groups, invitations)
            .HandleAsync(
                new CreateInvitationCommand(owner, groupId, "singer@example.com"),
                CancellationToken.None);

        Assert.False(created.Emailed);
        Assert.Single(invitations.Invitations);
    }

    [Fact]
    public async Task Create_with_email_when_send_fails_still_creates_invite()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        var created = await InviteHandler(groups, invitations, email: new FailingEmailSender())
            .HandleAsync(
                new CreateInvitationCommand(owner, groupId, "singer@example.com"),
                CancellationToken.None);

        Assert.False(created.Emailed);
        Assert.Single(invitations.Invitations);
    }

    [Fact]
    public async Task Create_with_invalid_email_throws_validation_and_does_not_persist()
    {
        var (groups, invitations, owner, groupId) = await SeedOwnerAsync();
        await Assert.ThrowsAsync<ValidationException>(() =>
            InviteHandler(groups, invitations)
                .HandleAsync(new CreateInvitationCommand(owner, groupId, "not-an-email"), CancellationToken.None));
        Assert.Empty(invitations.Invitations);
    }

    private static CreateInvitationHandler InviteHandler(
        FakeGroupStore groups,
        FakeInvitationStore invitations,
        DateTimeOffset? now = null,
        IEmailSender? email = null)
        => new(
            new GroupAccessService(groups),
            invitations,
            new FixedClock(now ?? Now),
            groups,
            email ?? new NoopEmailSender(),
            new FixedOrigin("http://localhost:5173"));

    private static string Sha256Hex(string plaintext)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(plaintext));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static async Task<(
        FakeGroupStore Groups,
        FakeInvitationStore Invitations,
        Guid Owner,
        Guid GroupId)> SeedOwnerAsync()
    {
        var groups = new FakeGroupStore();
        var invitations = new FakeInvitationStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        await groups.AddAsync(group, Membership.CreateOwner(group.Id, owner, Now), CancellationToken.None);
        await groups.SaveChangesAsync(CancellationToken.None);
        return (groups, invitations, owner, group.Id);
    }

    private static async Task<(
        FakeGroupStore Groups,
        FakeInvitationStore Invitations,
        Guid Owner,
        Guid GroupId,
        Guid Member)> SeedOwnerAndMemberAsync()
    {
        var seed = await SeedOwnerAsync();
        var member = Guid.NewGuid();
        seed.Groups.Memberships.Add(Membership.CreateMember(seed.GroupId, member, Now));
        return (seed.Groups, seed.Invitations, seed.Owner, seed.GroupId, member);
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCount { get; private set; }

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            SaveCount++;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeInvitationStore : IInvitationStore
    {
        public List<Invitation> Invitations { get; } = [];

        public Task AddAsync(Invitation invitation, CancellationToken cancellationToken)
        {
            Invitations.Add(invitation);
            return Task.CompletedTask;
        }

        public Task<Invitation?> GetByTokenHashAsync(string tokenHash, CancellationToken cancellationToken)
            => Task.FromResult(Invitations.FirstOrDefault(i => i.TokenHash == tokenHash));

        public Task<IReadOnlyList<Invitation>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Invitation>>(Invitations.Where(i => i.GroupId == groupId).ToList());

        public Task<Invitation?> GetForUpdateAsync(Guid groupId, Guid invitationId, CancellationToken cancellationToken)
            => Task.FromResult(Invitations.FirstOrDefault(i => i.GroupId == groupId && i.Id == invitationId));

        public Task RemoveAsync(Invitation invitation, CancellationToken cancellationToken)
        {
            Invitations.Remove(invitation);
            return Task.CompletedTask;
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeGroupStore : IGroupStore
    {
        public List<Group> Groups { get; } = [];
        public List<Membership> Memberships { get; } = [];

        public Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken)
        {
            Groups.Add(group);
            Memberships.Add(ownerMembership);
            return Task.CompletedTask;
        }

        public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
        {
            Memberships.Add(membership);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<GroupListItem>>([]);

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Groups.FirstOrDefault(g => g.Id == groupId && !g.IsDeleted));

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Memberships.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class NoopEmailSender : IEmailSender
    {
        public bool IsConfigured => false;

        public Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken)
            => Task.FromResult(false);
    }

    private sealed class CapturingEmailSender : IEmailSender
    {
        public bool IsConfigured => true;
        public List<OutboundEmail> Sent { get; } = [];

        public Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken)
        {
            Sent.Add(email);
            return Task.FromResult(true);
        }
    }

    private sealed class FailingEmailSender : IEmailSender
    {
        public bool IsConfigured => true;

        public Task<bool> TrySendAsync(OutboundEmail email, CancellationToken cancellationToken)
            => Task.FromResult(false);
    }

    private sealed class FixedOrigin : IPublicOrigin
    {
        private readonly string _origin;
        public FixedOrigin(string origin) => _origin = origin;
        public string? GetOrigin() => _origin;
    }
}
