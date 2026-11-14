using Sonivo.Application.Abstractions;
using Sonivo.Domain.Common;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed class GroupLifecycleHandlers(IGroupStore groups, IGroupAuditStore audit, IClock clock,
    IGroupOperationLock groupLock, IGroupPurger? purger = null)
{
    public async Task<IReadOnlyList<GroupLifecycleListItem>> ListAsync(Guid userId, CancellationToken cancellationToken)
        => (await groups.ListLifecycleForOwnerAsync(userId, cancellationToken))
            .Select(item => item with { CanPermanentlyDelete = purger?.IsEnabled == true }).ToArray();

    public Task ArchiveAsync(Guid userId, Guid groupId, int expectedVersion, CancellationToken cancellationToken)
        => MutateAsync(userId, groupId, expectedVersion, GroupAuditEntry.ActionGroupArchived,
            (group, version, now) => group.Archive(version, now), cancellationToken);

    public Task RestoreArchiveAsync(Guid userId, Guid groupId, int expectedVersion, CancellationToken cancellationToken)
        => MutateAsync(userId, groupId, expectedVersion, GroupAuditEntry.ActionGroupRestored,
            (group, version, now) => group.RestoreFromArchive(version, now), cancellationToken);

    public Task RestoreTrashAsync(Guid userId, Guid groupId, int expectedVersion, CancellationToken cancellationToken)
        => MutateAsync(userId, groupId, expectedVersion, GroupAuditEntry.ActionGroupRestoredFromTrash,
            (group, version, now) => group.RestoreFromTrash(version, now), cancellationToken);

    public async Task PurgeTrashAsync(Guid userId, Guid groupId, int expectedVersion, bool confirmed,
        CancellationToken cancellationToken)
    {
        if (!confirmed) throw new ValidationException("Permanent deletion requires explicit confirmation.");
        if (expectedVersion <= 0) throw new ValidationException("A positive expected version is required.");
        await groupLock.LockAsync(groupId, cancellationToken);
        var group = await groups.GetLifecycleGroupForOwnerAsync(groupId, userId, cancellationToken)
            ?? throw new NotFoundException("Group not found.");
        if (!group.IsDeleted || group.TrashExpiresAt is null)
            throw new ConflictException("Only a Group in Trash can be permanently deleted.");
        if (group.Version != expectedVersion) throw new ConflictException("Group version changed; refresh before deleting.");
        if (purger is null || !purger.IsEnabled) throw new ConflictException("Permanent deletion is temporarily unavailable.");
        await purger.PurgeAsync(groupId, userId, expectedVersion, cancellationToken);
    }

    private async Task MutateAsync(Guid userId, Guid groupId, int expectedVersion, string action,
        Action<Group, int, DateTimeOffset> mutate, CancellationToken cancellationToken)
    {
        if (expectedVersion <= 0) throw new ValidationException("A positive expected version is required.");
        await groupLock.LockAsync(groupId, cancellationToken);
        var group = await groups.GetLifecycleGroupForOwnerAsync(groupId, userId, cancellationToken)
            ?? throw new NotFoundException("Group not found.");

        try
        {
            mutate(group, expectedVersion, clock.UtcNow);
        }
        catch (ConcurrencyConflictException ex)
        {
            throw new ConflictException(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            throw new ConflictException(ex.Message);
        }

        await groups.UpdateAsync(group, cancellationToken);
        await audit.AddAsync(GroupAuditEntry.Create(groupId, action, clock.UtcNow, actorUserId: userId), cancellationToken);
        await groups.SaveChangesAsync(cancellationToken);
    }
}
