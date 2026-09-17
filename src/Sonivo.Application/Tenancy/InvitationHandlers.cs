using System.Security.Cryptography;
using System.Text;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record CreateInvitationCommand(Guid UserId, Guid GroupId, string? Email = null);

public sealed record InvitationCreatedDto(Guid Id, string Token, DateTimeOffset ExpiresAt, bool Emailed);

public sealed class CreateInvitationHandler
{
    public const int TokenByteCount = 16;
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    private readonly GroupAccessService _access;
    private readonly IInvitationStore _invitations;
    private readonly IClock _clock;
    private readonly IGroupStore _groups;
    private readonly IEmailSender _email;
    private readonly IPublicOrigin _origin;

    public CreateInvitationHandler(
        GroupAccessService access,
        IInvitationStore invitations,
        IClock clock,
        IGroupStore groups,
        IEmailSender email,
        IPublicOrigin origin)
    {
        _access = access;
        _invitations = invitations;
        _clock = clock;
        _groups = groups;
        _email = email;
        _origin = origin;
    }

    public async Task<InvitationCreatedDto> HandleAsync(
        CreateInvitationCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);
        var inviteeEmail = NormalizeInviteEmail(command.Email);

        var now = _clock.UtcNow;
        var token = GenerateToken();
        var invitation = Invitation.Create(
            command.GroupId,
            HashToken(token),
            command.UserId,
            now,
            now + Lifetime);

        await _invitations.AddAsync(invitation, cancellationToken);
        await _invitations.SaveChangesAsync(cancellationToken);

        var emailed = false;
        if (inviteeEmail is not null)
        {
            var origin = _origin.GetOrigin();
            if (_email.IsConfigured && !string.IsNullOrWhiteSpace(origin))
            {
                var group = await _groups.GetByIdAsync(command.GroupId, cancellationToken);
                var groupName = group?.Name ?? "a group";
                emailed = await _email.TrySendAsync(
                    new OutboundEmail(
                        inviteeEmail,
                        $"Join {groupName} on Sonivo",
                        $"You're invited to join {groupName} on Sonivo.\n\n{origin}/join/{token}\n\nThis link expires in 7 days."),
                    cancellationToken);
            }
        }

        return new InvitationCreatedDto(invitation.Id, token, invitation.ExpiresAt, emailed);
    }

    internal static string? NormalizeInviteEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return null;
        }

        var trimmed = email.Trim();
        var at = trimmed.IndexOf('@');
        if (at <= 0 || at >= trimmed.Length - 1 || trimmed.Contains(' ', StringComparison.Ordinal))
        {
            throw new ValidationException("Email is invalid.");
        }

        return trimmed;
    }

    internal static string GenerateToken()
    {
        Span<byte> bytes = stackalloc byte[TokenByteCount];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    internal static string HashToken(string plaintext)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(plaintext));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

public sealed record AcceptInvitationCommand(Guid UserId, string Token);

public sealed record InvitationAcceptedDto(Guid GroupId, string Role);

public sealed class AcceptInvitationHandler
{
    private const string InvalidInvitationMessage = "Invalid or expired invitation.";

    private readonly IGroupStore _groups;
    private readonly IInvitationStore _invitations;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public AcceptInvitationHandler(
        IGroupStore groups,
        IInvitationStore invitations,
        IUnitOfWork unitOfWork,
        IClock clock)
    {
        _groups = groups;
        _invitations = invitations;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<InvitationAcceptedDto> HandleAsync(
        AcceptInvitationCommand command,
        CancellationToken cancellationToken)
    {
        if (command.UserId == Guid.Empty)
        {
            throw new ValidationException("Authenticated user is required.");
        }

        if (string.IsNullOrWhiteSpace(command.Token))
        {
            throw new ValidationException(InvalidInvitationMessage);
        }

        var invitation = await _invitations.GetByTokenHashAsync(
            CreateInvitationHandler.HashToken(command.Token.Trim()),
            cancellationToken);
        var now = _clock.UtcNow;
        if (invitation is null || invitation.IsAccepted || invitation.IsExpired(now))
        {
            throw new ValidationException(InvalidInvitationMessage);
        }

        var group = await _groups.GetByIdAsync(invitation.GroupId, cancellationToken);
        if (group is null || group.IsDeleted)
        {
            throw new ValidationException(InvalidInvitationMessage);
        }

        var existing = await _groups.GetMembershipAsync(group.Id, command.UserId, cancellationToken);
        if (existing is not null)
        {
            throw new ConflictException("Already a member of this group.");
        }

        var membership = Membership.CreateMember(group.Id, command.UserId, now);
        invitation.Accept(command.UserId, now);
        await _groups.AddMembershipAsync(membership, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new InvitationAcceptedDto(group.Id, MembershipRoles.Member);
    }
}

public sealed record OutstandingInvitationDto(Guid Id, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);

public sealed record InvitationListDto(IReadOnlyList<OutstandingInvitationDto> Items);

public sealed record ListInvitationsQuery(Guid UserId, Guid GroupId);

public sealed class ListInvitationsHandler
{
    private readonly GroupAccessService _access;
    private readonly IInvitationStore _invitations;
    private readonly IClock _clock;

    public ListInvitationsHandler(GroupAccessService access, IInvitationStore invitations, IClock clock)
    {
        _access = access;
        _invitations = invitations;
        _clock = clock;
    }

    public async Task<InvitationListDto> HandleAsync(
        ListInvitationsQuery query,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(query.GroupId, query.UserId, cancellationToken);
        var now = _clock.UtcNow;
        var items = (await _invitations.ListByGroupAsync(query.GroupId, cancellationToken))
            .Where(i => i.IsOutstanding(now))
            .OrderByDescending(i => i.CreatedAt)
            .ThenBy(i => i.Id)
            .Select(i => new OutstandingInvitationDto(i.Id, i.CreatedAt, i.ExpiresAt))
            .ToList();
        return new InvitationListDto(items);
    }
}

public sealed record RevokeInvitationCommand(Guid UserId, Guid GroupId, Guid InvitationId);

public sealed class RevokeInvitationHandler
{
    private readonly GroupAccessService _access;
    private readonly IInvitationStore _invitations;
    private readonly IClock _clock;

    public RevokeInvitationHandler(GroupAccessService access, IInvitationStore invitations, IClock clock)
    {
        _access = access;
        _invitations = invitations;
        _clock = clock;
    }

    public async Task HandleAsync(RevokeInvitationCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);
        var invitation = await _invitations.GetForUpdateAsync(
            command.GroupId, command.InvitationId, cancellationToken);
        var now = _clock.UtcNow;
        if (invitation is null || invitation.IsExpired(now))
        {
            throw new NotFoundException("Invitation not found.");
        }

        try
        {
            invitation.EnsureCanRevoke();
        }
        catch (InvalidOperationException)
        {
            throw new ConflictException("Invitation already accepted.");
        }

        await _invitations.RemoveAsync(invitation, cancellationToken);
        await _invitations.SaveChangesAsync(cancellationToken);
    }
}
