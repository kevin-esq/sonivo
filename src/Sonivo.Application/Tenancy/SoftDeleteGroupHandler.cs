using Microsoft.Extensions.Logging;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Common;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record SoftDeleteGroupCommand(Guid UserId, Guid GroupId, int ExpectedVersion);

public sealed class SoftDeleteGroupHandler
{
    private readonly GroupAccessService _access;
    private readonly IGroupStore _store;
    private readonly IClock _clock;
    private readonly IGroupOperationLock? _groupLock;
    private readonly ILogger<SoftDeleteGroupHandler>? _logger;
    private readonly IGroupAuditStore? _audit;

    public SoftDeleteGroupHandler(
        GroupAccessService access,
        IGroupStore store,
        IClock clock,
        ILogger<SoftDeleteGroupHandler>? logger = null,
        IGroupAuditStore? audit = null,
        IGroupOperationLock? groupLock = null)
    {
        _access = access;
        _store = store;
        _clock = clock;
        _logger = logger;
        _audit = audit;
        _groupLock = groupLock;
    }

    public async Task HandleAsync(SoftDeleteGroupCommand command, CancellationToken cancellationToken)
    {
        if (_groupLock is not null)
            await _groupLock.LockAsync(command.GroupId, cancellationToken);
        var (group, _) = await _access.RequireOwnerAsync(command.GroupId, command.UserId, cancellationToken);

        try
        {
            group.SoftDelete(command.ExpectedVersion, _clock.UtcNow);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await _store.UpdateAsync(group, cancellationToken);
        if (_audit is not null)
            await _audit.AddAsync(GroupAuditEntry.Create(command.GroupId,
                GroupAuditEntry.ActionGroupTrashed, _clock.UtcNow, actorUserId: command.UserId), cancellationToken);
        await _store.SaveChangesAsync(cancellationToken);

        _logger?.LogWarning(
            "Security event: group soft-deleted. ActorUserId: {ActorUserId}, GroupId: {GroupId}",
            command.UserId,
            command.GroupId);
    }
}
