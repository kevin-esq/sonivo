using Sonivo.Domain.Scheduling;

namespace Sonivo.Application.Abstractions;

public interface ISetlistStore
{
    Task AddAsync(Setlist setlist, CancellationToken cancellationToken);
    Task<IReadOnlyList<Setlist>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task<Setlist?> GetByIdAsync(Guid groupId, Guid setlistId, CancellationToken cancellationToken);
    Task<Setlist?> GetByIdWithItemsAsync(Guid groupId, Guid setlistId, CancellationToken cancellationToken);
    Task RemoveItemsAsync(IEnumerable<SetlistItem> items, CancellationToken cancellationToken);
    Task AddItemsAsync(IEnumerable<SetlistItem> items, CancellationToken cancellationToken);
    Task UpdateAsync(Setlist setlist, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
