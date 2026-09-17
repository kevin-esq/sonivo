using Sonivo.Domain.Scheduling;

namespace Sonivo.Application.Abstractions;

public interface IEventStore
{
    Task AddAsync(Event musicalEvent, CancellationToken cancellationToken);
    Task<IReadOnlyList<Event>> ListActiveByGroupAsync(Guid groupId, CancellationToken cancellationToken);
    Task<Event?> GetByIdWithItemsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken);
    Task RemoveItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken);
    Task AddItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken);
    Task UpdateAsync(Event musicalEvent, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
