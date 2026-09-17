using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Abstractions;

public interface IResourceStore
{
    Task AddAsync(Resource resource, CancellationToken cancellationToken);
    Task<IReadOnlyList<Resource>> ListByArrangementAsync(Guid arrangementId, CancellationToken cancellationToken);
    Task<Resource?> GetByIdAsync(Guid arrangementId, Guid resourceId, CancellationToken cancellationToken);
    Task UpdateAsync(Resource resource, CancellationToken cancellationToken);
    Task RemoveAsync(Resource resource, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
