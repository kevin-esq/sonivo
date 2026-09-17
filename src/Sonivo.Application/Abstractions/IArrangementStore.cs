using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Abstractions;

public interface IArrangementStore
{
    Task AddAsync(Arrangement arrangement, CancellationToken cancellationToken);
    Task<IReadOnlyList<Arrangement>> ListBySongAsync(Guid groupId, Guid songId, CancellationToken cancellationToken);
    /// <summary>Live Arrangements only (query filter); tracked for cascade update.</summary>
    Task<IReadOnlyList<Arrangement>> ListLiveTrackedBySongAsync(Guid groupId, Guid songId, CancellationToken cancellationToken);
    Task<Arrangement?> GetByIdAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken);
    Task<Arrangement?> GetByIdWithResourcesAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken);
    Task UpdateAsync(Arrangement arrangement, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
