using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfArrangementStore : IArrangementStore
{
    private readonly SonivoDbContext _db;

    public EfArrangementStore(SonivoDbContext db)
    {
        _db = db;
    }

    public Task AddAsync(Arrangement arrangement, CancellationToken cancellationToken)
        => _db.Arrangements.AddAsync(arrangement, cancellationToken).AsTask();

    public async Task<IReadOnlyList<Arrangement>> ListBySongAsync(
        Guid groupId,
        Guid songId,
        CancellationToken cancellationToken)
    {
        return await _db.Arrangements
            .AsNoTracking()
            .Where(a => a.GroupId == groupId && a.SongId == songId)
            .OrderBy(a => a.CreatedAt)
            .ThenBy(a => a.Id)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Arrangement>> ListLiveTrackedBySongAsync(
        Guid groupId,
        Guid songId,
        CancellationToken cancellationToken)
    {
        return await _db.Arrangements
            .Where(a => a.GroupId == groupId && a.SongId == songId)
            .OrderBy(a => a.CreatedAt)
            .ThenBy(a => a.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<Arrangement?> GetByIdAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
        => _db.Arrangements.FirstOrDefaultAsync(
            a => a.GroupId == groupId && a.Id == arrangementId,
            cancellationToken);

    public Task<Arrangement?> GetByIdWithResourcesAsync(
        Guid groupId,
        Guid arrangementId,
        CancellationToken cancellationToken)
        => _db.Arrangements
            .Include(a => a.Resources)
            .FirstOrDefaultAsync(a => a.GroupId == groupId && a.Id == arrangementId, cancellationToken);

    public Task UpdateAsync(Arrangement arrangement, CancellationToken cancellationToken)
    {
        _db.Arrangements.Update(arrangement);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
