using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record MemberListItemDto(Guid UserId, string DisplayName, string Role, DateTimeOffset CreatedAt);

public sealed record MemberListDto(IReadOnlyList<MemberListItemDto> Items);

public sealed record ListMembersQuery(Guid UserId, Guid GroupId);

public sealed class ListMembersHandler
{
    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly IUserDirectory _directory;

    public ListMembersHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUserDirectory directory)
    {
        _access = access;
        _memberships = memberships;
        _directory = directory;
    }

    public async Task<MemberListDto> HandleAsync(ListMembersQuery query, CancellationToken cancellationToken)
    {
        await _access.RequireMemberAsync(query.GroupId, query.UserId, cancellationToken);
        var rows = await _memberships.ListByGroupAsync(query.GroupId, cancellationToken);
        var names = (await _directory.GetByIdsAsync(rows.Select(r => r.UserId).ToList(), cancellationToken))
            .ToDictionary(e => e.UserId, e => e.DisplayName);

        var items = rows
            .Select(m => new MemberListItemDto(
                m.UserId,
                names.TryGetValue(m.UserId, out var name) && !string.IsNullOrWhiteSpace(name)
                    ? name
                    : m.UserId.ToString("D"),
                m.Role,
                m.CreatedAt))
            .OrderBy(i => i.Role == MembershipRoles.Owner ? 0 : 1)
            .ThenBy(i => i.DisplayName, StringComparer.Ordinal)
            .ThenBy(i => i.UserId)
            .ToList();

        return new MemberListDto(items);
    }
}

public sealed record RemoveMemberCommand(Guid ActorUserId, Guid GroupId, Guid TargetUserId);

public sealed class RemoveMemberHandler
{
    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveMemberHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUnitOfWork unitOfWork)
    {
        _access = access;
        _memberships = memberships;
        _unitOfWork = unitOfWork;
    }

    public async Task HandleAsync(RemoveMemberCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.ActorUserId, cancellationToken);
        if (command.TargetUserId == command.ActorUserId)
        {
            throw new ValidationException("Leave the group instead of removing yourself.");
        }

        var target = await _memberships.GetForUpdateAsync(
            command.GroupId, command.TargetUserId, cancellationToken);
        if (target is null)
        {
            throw new NotFoundException("Member not found.");
        }

        if (target.IsOwner)
        {
            var owners = await _memberships.CountOwnersAsync(command.GroupId, cancellationToken);
            if (owners <= 1)
            {
                throw new ConflictException("Cannot remove the last Owner.");
            }
        }

        await _memberships.RemoveAsync(target, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}

public sealed record ChangeMemberRoleCommand(
    Guid ActorUserId,
    Guid GroupId,
    Guid TargetUserId,
    string? Role);

public sealed class ChangeMemberRoleHandler
{
    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly IUnitOfWork _unitOfWork;

    public ChangeMemberRoleHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUnitOfWork unitOfWork)
    {
        _access = access;
        _memberships = memberships;
        _unitOfWork = unitOfWork;
    }

    public async Task HandleAsync(ChangeMemberRoleCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.ActorUserId, cancellationToken);
        var role = command.Role?.Trim() ?? string.Empty;
        if (role is not (MembershipRoles.Owner or MembershipRoles.Member))
        {
            throw new ValidationException("Role must be Owner or Member.");
        }

        var target = await _memberships.GetForUpdateAsync(
            command.GroupId, command.TargetUserId, cancellationToken);
        if (target is null)
        {
            throw new NotFoundException("Member not found.");
        }

        if (target.IsOwner && role == MembershipRoles.Member)
        {
            var owners = await _memberships.CountOwnersAsync(command.GroupId, cancellationToken);
            if (owners <= 1)
            {
                throw new ConflictException("Cannot demote the last Owner.");
            }
        }

        try
        {
            target.AssignRole(role);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}

public sealed record LeaveGroupCommand(Guid UserId, Guid GroupId);

public sealed class LeaveGroupHandler
{
    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly IUnitOfWork _unitOfWork;

    public LeaveGroupHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUnitOfWork unitOfWork)
    {
        _access = access;
        _memberships = memberships;
        _unitOfWork = unitOfWork;
    }

    public async Task HandleAsync(LeaveGroupCommand command, CancellationToken cancellationToken)
    {
        var (_, membership) = await _access.RequireMemberAsync(
            command.GroupId, command.UserId, cancellationToken);

        var tracked = await _memberships.GetForUpdateAsync(
            command.GroupId, command.UserId, cancellationToken)
            ?? throw new NotFoundException("Group not found.");

        if (membership.IsOwner)
        {
            var owners = await _memberships.CountOwnersAsync(command.GroupId, cancellationToken);
            if (owners <= 1)
            {
                throw new ConflictException("Cannot leave as the last Owner.");
            }
        }

        await _memberships.RemoveAsync(tracked, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
