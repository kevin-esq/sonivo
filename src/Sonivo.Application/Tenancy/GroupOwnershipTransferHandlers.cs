using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tenancy;

public sealed record OwnershipTransferDto(Guid Id, Guid GroupId, Guid FromUserId, Guid ToUserId,
    DateTimeOffset RequestedAt, DateTimeOffset ExpiresAt);

public sealed class GroupOwnershipTransferHandlers(
    GroupAccessService access,
    IMembershipStore memberships,
    IGroupOwnershipTransferStore transfers,
    IGroupDataOperation data,
    IUnitOfWork unitOfWork,
    IGroupAuditStore audit,
    IAccountAuditStore accountAudit,
    IManagedAccountNotifier notifier,
    IClock clock)
{
    public Task<OwnershipTransferDto?> GetPendingAsync(Guid userId, Guid groupId, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            await access.RequireMemberAsync(groupId, userId, token);
            var transfer = await transfers.FindPendingAsync(groupId, token);
            if (transfer is null || transfer.ExpireIfDue(clock.UtcNow)) return null;
            if (transfer.FromUserId != userId && transfer.ToUserId != userId) return null;
            return ToDto(transfer);
        }, ct);

    public Task<OwnershipTransferDto> RequestAsync(Guid userId, Guid groupId, Guid targetUserId, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            await access.RequireOwnerAsync(groupId, userId, token);
            await transfers.LockGroupAsync(groupId, token);
            var target = await memberships.GetForUpdateAsync(groupId, targetUserId, token)
                ?? throw new NotFoundException("Member not found.");
            if (!target.AccessEnabled || target.IsOwner) throw new ConflictException("ownership-transfer-target-invalid");
            var existing = await transfers.FindPendingAsync(groupId, token);
            if (existing is not null && !existing.ExpireIfDue(clock.UtcNow))
                throw new ConflictException("ownership-transfer-pending");
            var transfer = GroupOwnershipTransfer.Create(groupId, userId, targetUserId, clock.UtcNow);
            await transfers.AddAsync(transfer, token);
            await audit.AddAsync(GroupAuditEntry.Create(groupId, "owner_transfer_requested", clock.UtcNow,
                actorUserId: userId, targetUserId: targetUserId), token);
            await unitOfWork.SaveChangesAsync(token);
            return ToDto(transfer);
        }, ct);

    public async Task AcceptAsync(Guid userId, Guid groupId, Guid transferId, CancellationToken ct)
    {
        await data.ExecuteAsUserAsync(userId, async token =>
        {
            await access.RequireMemberAsync(groupId, userId, token);
            await transfers.LockGroupAsync(groupId, token);
            var transfer = await transfers.GetForUpdateAsync(groupId, transferId, token)
                ?? throw new NotFoundException("Ownership transfer not found.");
            if (transfer.ToUserId != userId || transfer.ExpireIfDue(clock.UtcNow) || !transfer.IsPending)
                throw new ConflictException("ownership-transfer-unavailable");

            var currentOwner = await memberships.GetForUpdateAsync(groupId, transfer.FromUserId, token);
            var recipient = await memberships.GetForUpdateAsync(groupId, userId, token);
            if (currentOwner is null || !currentOwner.IsOwner || !currentOwner.AccessEnabled
                || recipient is null || !recipient.AccessEnabled || recipient.IsOwner)
                throw new ConflictException("ownership-transfer-owner-changed");

            if (!await transfers.MoveToActiveSubscriptionAsync(groupId, userId, clock.UtcNow, token))
                throw new ConflictException("ownership-transfer-active-subscription-required");
            await unitOfWork.SaveChangesAsync(token);

            currentOwner.RelinquishOwnership();
            await unitOfWork.SaveChangesAsync(token);

            recipient.AcceptOwnershipTransfer();
            transfer.Accept(userId, clock.UtcNow);
            await audit.AddAsync(GroupAuditEntry.Create(groupId, "owner_transferred", clock.UtcNow,
                actorUserId: userId, targetUserId: transfer.FromUserId, metadata: "former-owner=member"), token);
            await accountAudit.AddAsync(AccountAudit.Create(AccountAudit.ActionOwnerTransferred, clock.UtcNow,
                actorUserId: transfer.FromUserId, targetUserId: userId, groupId: groupId), token);
            await unitOfWork.SaveChangesAsync(token);
            return true;
        }, ct);
        await notifier.NotifyOwnerChangedAsync(groupId, userId, ct);
    }

    public Task CancelAsync(Guid userId, Guid groupId, Guid transferId, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            await access.RequireOwnerAsync(groupId, userId, token);
            await transfers.LockGroupAsync(groupId, token);
            var transfer = await transfers.GetForUpdateAsync(groupId, transferId, token)
                ?? throw new NotFoundException("Ownership transfer not found.");
            try { transfer.Cancel(userId, clock.UtcNow); }
            catch (InvalidOperationException) { throw new ConflictException("ownership-transfer-unavailable"); }
            await audit.AddAsync(GroupAuditEntry.Create(groupId, "owner_transfer_cancelled", clock.UtcNow,
                actorUserId: userId, targetUserId: transfer.ToUserId), token);
            await unitOfWork.SaveChangesAsync(token);
            return true;
        }, ct);

    private static OwnershipTransferDto ToDto(GroupOwnershipTransfer transfer)
        => new(transfer.Id, transfer.GroupId, transfer.FromUserId, transfer.ToUserId,
            transfer.RequestedAt, transfer.ExpiresAt);
}
