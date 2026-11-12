using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IGroupOwnershipTransferStore
{
    Task LockGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task<GroupOwnershipTransfer?> FindPendingAsync(Guid groupId, CancellationToken cancellationToken);
    Task<GroupOwnershipTransfer?> GetForUpdateAsync(Guid groupId, Guid transferId, CancellationToken cancellationToken);
    Task<bool> MoveToActiveSubscriptionAsync(Guid groupId, Guid newOwnerUserId, DateTimeOffset now, CancellationToken cancellationToken);
    Task AddAsync(GroupOwnershipTransfer transfer, CancellationToken cancellationToken);
}
