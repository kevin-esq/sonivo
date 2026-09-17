using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Abstractions;

public interface IMembershipStore
{
    Task<IReadOnlyList<Membership>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task<Membership?> GetForUpdateAsync(Guid groupId, Guid userId, CancellationToken cancellationToken);
    Task RemoveAsync(Membership membership, CancellationToken cancellationToken);
    Task<int> CountOwnersAsync(Guid groupId, CancellationToken cancellationToken);
}
