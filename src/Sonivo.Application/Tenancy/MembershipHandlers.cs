using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record MemberListItemDto(
    Guid UserId,
    string DisplayName,
    string Role,
    string? MusicalRole,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastSeenAt,
    string? Email);

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
        var rows = (await _memberships.ListByGroupAsync(query.GroupId, cancellationToken))
            .Where(r => r.UserId.HasValue)
            .ToList();
        var directory = (await _directory.GetByIdsAsync(rows.Select(r => r.UserId!.Value).ToList(), cancellationToken))
            .ToDictionary(e => e.UserId);

        var items = rows
            .Select(m => new MemberListItemDto(
                m.UserId!.Value,
                directory.TryGetValue(m.UserId!.Value, out var entry) && !string.IsNullOrWhiteSpace(entry.DisplayName)
                    ? entry.DisplayName
                    : m.UserId!.Value.ToString("D"),
                m.Role,
                m.MusicalRole,
                m.CreatedAt,
                directory.TryGetValue(m.UserId!.Value, out var entry2) ? entry2.LastSeenAt : null,
                directory.TryGetValue(m.UserId!.Value, out var entry3) ? entry3.Email : null))
            .OrderBy(i => RoleRank(i.Role))
            .ThenBy(i => i.DisplayName, StringComparer.Ordinal)
            .ThenBy(i => i.UserId)
            .ToList();

        return new MemberListDto(items);
    }

    private static int RoleRank(string role) => role switch
    {
        MembershipRoles.Owner => 0,
        MembershipRoles.Manager => 1,
        MembershipRoles.Member => 2,
        MembershipRoles.Viewer => 3,
        _ => 4
    };
}

public sealed record PresenceHeartbeatCommand(Guid UserId, DateTimeOffset Now);

/// <summary>ADR-0055 W-E: best-effort presence heartbeat (throttled, never authorizes).</summary>
public sealed class PresenceHeartbeatHandler
{
    private readonly IUserDirectory _directory;

    public PresenceHeartbeatHandler(IUserDirectory directory)
    {
        _directory = directory;
    }

    public Task HandleAsync(PresenceHeartbeatCommand command, CancellationToken cancellationToken)
        => _directory.TouchLastSeenAsync(command.UserId, command.Now, cancellationToken);
}

public sealed record RemoveMemberCommand(Guid ActorUserId, Guid GroupId, Guid TargetUserId);

public sealed class RemoveMemberHandler
{
    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IGroupAuditStore? _audit;
    private readonly IClock? _clock;
    private readonly ILogger<RemoveMemberHandler>? _logger;

    public RemoveMemberHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUnitOfWork unitOfWork,
        ILogger<RemoveMemberHandler>? logger = null,
        IGroupAuditStore? audit = null,
        IClock? clock = null)
    {
        _access = access;
        _memberships = memberships;
        _unitOfWork = unitOfWork;
        _logger = logger;
        _audit = audit;
        _clock = clock;
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
        await RecordAuditAsync(
            command.GroupId,
            command.ActorUserId,
            command.TargetUserId,
            GroupAuditEntry.ActionMemberRemoved,
            metadata: null,
            cancellationToken);

        _logger?.LogWarning(
            "Security event: member removed. ActorUserId: {ActorUserId}, GroupId: {GroupId}, TargetUserId: {TargetUserId}",
            command.ActorUserId,
            command.GroupId,
            command.TargetUserId);
    }

    private async Task RecordAuditAsync(
        Guid groupId,
        Guid actorUserId,
        Guid targetUserId,
        string action,
        string? metadata,
        CancellationToken cancellationToken)
    {
        if (_audit is null)
        {
            return;
        }

        await _audit.AddAsync(
            GroupAuditEntry.Create(
                groupId,
                action,
                _clock?.UtcNow ?? DateTimeOffset.UtcNow,
                actorUserId: actorUserId,
                targetUserId: targetUserId,
                metadata: metadata),
            cancellationToken);
        await _audit.SaveChangesAsync(cancellationToken);
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
    private readonly IAccountAuditStore? _audit;
    private readonly IManagedAccountNotifier? _notifier;
    private readonly IGroupAuditStore? _groupAudit;
    private readonly IClock? _clock;
    private readonly ILogger<ChangeMemberRoleHandler>? _logger;

    public ChangeMemberRoleHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUnitOfWork unitOfWork,
        ILogger<ChangeMemberRoleHandler>? logger = null,
        IAccountAuditStore? audit = null,
        IManagedAccountNotifier? notifier = null,
        IGroupAuditStore? groupAudit = null,
        IClock? clock = null)
    {
        _access = access;
        _memberships = memberships;
        _unitOfWork = unitOfWork;
        _logger = logger;
        _audit = audit;
        _notifier = notifier;
        _groupAudit = groupAudit;
        _clock = clock;
    }

    public async Task HandleAsync(ChangeMemberRoleCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireOwnerAsync(command.GroupId, command.ActorUserId, cancellationToken);
        var role = command.Role?.Trim() ?? string.Empty;
        if (!MembershipRoles.IsValid(role))
        {
            throw new ValidationException(
                $"Role must be one of {string.Join(", ", MembershipRoles.All)}.");
        }

        var target = await _memberships.GetForUpdateAsync(
            command.GroupId, command.TargetUserId, cancellationToken);
        if (target is null)
        {
            throw new NotFoundException("Member not found.");
        }

        if (target.IsOwner && role != MembershipRoles.Owner)
        {
            var owners = await _memberships.CountOwnersAsync(command.GroupId, cancellationToken);
            if (owners <= 1)
            {
                throw new ConflictException("Cannot demote the last Owner.");
            }
        }

        var wasOwner = target.IsOwner;
        var previousRole = target.Role;
        try
        {
            target.AssignRole(role);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // F4: per-group audit of the role change.
        if (!string.Equals(previousRole, role, StringComparison.Ordinal) && _groupAudit is not null)
        {
            await _groupAudit.AddAsync(
                GroupAuditEntry.Create(
                    command.GroupId,
                    GroupAuditEntry.ActionRoleChanged,
                    _clock?.UtcNow ?? DateTimeOffset.UtcNow,
                    actorUserId: command.ActorUserId,
                    targetUserId: command.TargetUserId,
                    metadata: role),
                cancellationToken);
            await _groupAudit.SaveChangesAsync(cancellationToken);
        }

        // F3: a new Owner inherits the group's reset power over its managed
        // accounts — audit it and notify the affected members (ADR-0047 §13).
        if (!wasOwner && role == MembershipRoles.Owner && target.UserId is { } newOwnerId)
        {
            if (_audit is not null)
            {
                await _audit.AddAsync(
                    AccountAudit.Create(
                        AccountAudit.ActionOwnerTransferred,
                        _clock?.UtcNow ?? DateTimeOffset.UtcNow,
                        actorUserId: command.ActorUserId,
                        targetUserId: newOwnerId,
                        groupId: command.GroupId),
                    cancellationToken);
                await _audit.SaveChangesAsync(cancellationToken);
            }

            if (_notifier is not null)
            {
                await _notifier.NotifyOwnerChangedAsync(command.GroupId, newOwnerId, cancellationToken);
            }
        }

        _logger?.LogWarning(
            "Security event: member role changed. ActorUserId: {ActorUserId}, GroupId: {GroupId}, TargetUserId: {TargetUserId}, Role: {Role}",
            command.ActorUserId,
            command.GroupId,
            command.TargetUserId,
            role);
    }
}

public sealed record SetMusicalRoleCommand(
    Guid ActorUserId,
    Guid GroupId,
    Guid TargetUserId,
    string? MusicalRole);

/// <summary>Owner or Manager sets the descriptive musical role of a member (ADR-0051).</summary>
public sealed class SetMusicalRoleHandler
{
    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IGroupAuditStore? _audit;
    private readonly IClock? _clock;

    public SetMusicalRoleHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUnitOfWork unitOfWork,
        IGroupAuditStore? audit = null,
        IClock? clock = null)
    {
        _access = access;
        _memberships = memberships;
        _unitOfWork = unitOfWork;
        _audit = audit;
        _clock = clock;
    }

    public async Task HandleAsync(SetMusicalRoleCommand command, CancellationToken cancellationToken)
    {
        await _access.RequireManagerAsync(command.GroupId, command.ActorUserId, cancellationToken);

        var target = await _memberships.GetForUpdateAsync(
            command.GroupId, command.TargetUserId, cancellationToken);
        if (target is null)
        {
            throw new NotFoundException("Member not found.");
        }

        try
        {
            target.SetMusicalRole(command.MusicalRole);
        }
        catch (ArgumentException ex)
        {
            throw new ValidationException(ex.Message);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (_audit is not null)
        {
            await _audit.AddAsync(
                GroupAuditEntry.Create(
                    command.GroupId,
                    GroupAuditEntry.ActionMusicalRoleChanged,
                    _clock?.UtcNow ?? DateTimeOffset.UtcNow,
                    actorUserId: command.ActorUserId,
                    targetUserId: command.TargetUserId,
                    metadata: target.MusicalRole),
                cancellationToken);
            await _audit.SaveChangesAsync(cancellationToken);
        }
    }
}

public sealed record LeaveGroupCommand(Guid UserId, Guid GroupId);

public sealed class LeaveGroupHandler
{
    private readonly GroupAccessService _access;
    private readonly IMembershipStore _memberships;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IGroupAuditStore? _audit;
    private readonly IClock? _clock;
    private readonly ILogger<LeaveGroupHandler>? _logger;

    public LeaveGroupHandler(
        GroupAccessService access,
        IMembershipStore memberships,
        IUnitOfWork unitOfWork,
        ILogger<LeaveGroupHandler>? logger = null,
        IGroupAuditStore? audit = null,
        IClock? clock = null)
    {
        _access = access;
        _memberships = memberships;
        _unitOfWork = unitOfWork;
        _logger = logger;
        _audit = audit;
        _clock = clock;
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

        if (_audit is not null)
        {
            await _audit.AddAsync(
                GroupAuditEntry.Create(
                    command.GroupId,
                    GroupAuditEntry.ActionMemberLeft,
                    _clock?.UtcNow ?? DateTimeOffset.UtcNow,
                    actorUserId: command.UserId,
                    targetUserId: command.UserId),
                cancellationToken);
            await _audit.SaveChangesAsync(cancellationToken);
        }

        _logger?.LogWarning(
            "Security event: member left group. ActorUserId: {ActorUserId}, GroupId: {GroupId}",
            command.UserId,
            command.GroupId);
    }
}
