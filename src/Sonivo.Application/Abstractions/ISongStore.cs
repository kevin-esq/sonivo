using Sonivo.Domain.Repertoire;

namespace Sonivo.Application.Abstractions;

public interface ISongStore
{
    Task AddAsync(Song song, CancellationToken cancellationToken);
    Task<IReadOnlyList<Song>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task<Song?> GetByIdAsync(Guid groupId, Guid songId, CancellationToken cancellationToken);
    Task<int> CountLiveArrangementsAsync(Guid groupId, Guid songId, CancellationToken cancellationToken);
    Task UpdateAsync(Song song, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
