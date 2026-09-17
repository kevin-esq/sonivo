using System.Security.Cryptography;
using System.Text;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record CreateInvitationCommand(Guid UserId, Guid GroupId);

public sealed record InvitationCreatedDto(Guid Id, string Token, DateTimeOffset ExpiresAt);

public sealed class CreateInvitationHandler
{
    public const int TokenByteCount = 16;
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    private readonly GroupAccessService _access;
    private readonly IInvitationStore _invitations;
    private readonly IClock _clock;

    public CreateInvitationHandler(GroupAccessService access, IInvitationStore invitations, IClock clock)
    {
        _access = access;
        _invitations = invitations;
        _clock = clock;
    }

    public async Task<InvitationCreatedDto> HandleAsync(
        CreateInvitationCommand command,
        CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

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

        return new InvitationCreatedDto(invitation.Id, token, invitation.ExpiresAt);
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
