using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Scheduling;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfSetlistStore : ISetlistStore
{
    private readonly SonivoDbContext _db;

    public EfSetlistStore(SonivoDbContext db)
    {
        _db = db;
    }

    public Task AddAsync(Setlist setlist, CancellationToken cancellationToken)
        => _db.Setlists.AddAsync(setlist, cancellationToken).AsTask();

    public async Task<IReadOnlyList<Setlist>> ListByGroupAsync(Guid groupId, CancellationToken cancellationToken)
    {
        return await _db.Setlists
            .AsNoTracking()
            .Include(s => s.Items)
            .Where(s => s.GroupId == groupId)
            .OrderBy(s => s.Name)
            .ThenBy(s => s.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<Setlist?> GetByIdAsync(Guid groupId, Guid setlistId, CancellationToken cancellationToken)
        => _db.Setlists
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.GroupId == groupId && s.Id == setlistId, cancellationToken);

    public Task<Setlist?> GetByIdWithItemsAsync(Guid groupId, Guid setlistId, CancellationToken cancellationToken)
        => _db.Setlists
            .Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.GroupId == groupId && s.Id == setlistId, cancellationToken);

    public Task RemoveItemsAsync(IEnumerable<SetlistItem> items, CancellationToken cancellationToken)
    {
        _db.SetlistItems.RemoveRange(items);
        return Task.CompletedTask;
    }

    public async Task AddItemsAsync(IEnumerable<SetlistItem> items, CancellationToken cancellationToken)
    {
        await _db.SetlistItems.AddRangeAsync(items, cancellationToken);
    }

    public Task UpdateAsync(Setlist setlist, CancellationToken cancellationToken)
    {
        _db.Setlists.Update(setlist);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
