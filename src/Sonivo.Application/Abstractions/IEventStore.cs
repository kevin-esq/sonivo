using Sonivo.Domain.Scheduling;

namespace Sonivo.Application.Abstractions;

public interface IEventStore
{
    Task AddAsync(Event musicalEvent, CancellationToken cancellationToken);
    Task<IReadOnlyList<Event>> ListActiveByGroupAsync(Guid groupId, CancellationToken cancellationToken);

    /// <summary>
    /// Upcoming events across every group the caller belongs to (ADR-0053).
    /// Excludes hidden/cancelled events; earliest first, capped by <paramref name="limit"/>.
    /// </summary>
    Task<IReadOnlyList<UpcomingActivityItem>> ListUpcomingForUserAsync(
        Guid userId,
        int limit,
        CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<UpcomingActivityItem>>(Array.Empty<UpcomingActivityItem>());

    Task<Event?> GetByIdWithItemsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken);
    Task<Event?> GetByIdWithRsvpsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken);
    Task AddRsvpAsync(Rsvp rsvp, CancellationToken cancellationToken);
    Task RemoveItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken);
    Task AddItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken);
    Task UpdateAsync(Event musicalEvent, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

/// <summary>Cross-group upcoming event projection (ADR-0053).</summary>
public sealed record UpcomingActivityItem(
    Guid GroupId,
    string GroupName,
    Guid EventId,
    string Title,
    string Type,
    DateTimeOffset StartsAt);
