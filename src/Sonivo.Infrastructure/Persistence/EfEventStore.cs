using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Scheduling;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfEventStore : IEventStore
{
    private readonly SonivoDbContext _db;

    public EfEventStore(SonivoDbContext db)
    {
        _db = db;
    }

    public Task AddAsync(Event musicalEvent, CancellationToken cancellationToken)
        => _db.Events.AddAsync(musicalEvent, cancellationToken).AsTask();

    public async Task<IReadOnlyList<Event>> ListActiveByGroupAsync(Guid groupId, CancellationToken cancellationToken)
    {
        return await _db.Events
            .AsNoTracking()
            .Where(e =>
                e.GroupId == groupId
                && e.Status == EventStatuses.Scheduled
                && !e.IsHidden)
            .OrderBy(e => e.StartsAt)
            .ThenBy(e => e.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<Event?> GetByIdWithItemsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken)
        => _db.Events
            .Include(e => e.Items)
            .FirstOrDefaultAsync(e => e.GroupId == groupId && e.Id == eventId, cancellationToken);

    public Task<Event?> GetByIdWithRsvpsAsync(Guid groupId, Guid eventId, CancellationToken cancellationToken)
        => _db.Events
            .Include(e => e.Rsvps)
            .FirstOrDefaultAsync(e => e.GroupId == groupId && e.Id == eventId, cancellationToken);

    public Task AddRsvpAsync(Rsvp rsvp, CancellationToken cancellationToken)
        => _db.Rsvps.AddAsync(rsvp, cancellationToken).AsTask();

    public Task RemoveItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken)
    {
        _db.EventSetlistItems.RemoveRange(items);
        return Task.CompletedTask;
    }

    public async Task AddItemsAsync(IEnumerable<EventSetlistItem> items, CancellationToken cancellationToken)
    {
        await _db.EventSetlistItems.AddRangeAsync(items, cancellationToken);
    }

    public Task UpdateAsync(Event musicalEvent, CancellationToken cancellationToken)
    {
        _db.Events.Update(musicalEvent);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
