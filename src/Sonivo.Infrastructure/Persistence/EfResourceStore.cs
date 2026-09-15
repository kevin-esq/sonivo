using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Repertoire;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfResourceStore : IResourceStore
{
    private readonly SonivoDbContext _db;

    public EfResourceStore(SonivoDbContext db)
    {
        _db = db;
    }

    public Task AddAsync(Resource resource, CancellationToken cancellationToken)
        => _db.Resources.AddAsync(resource, cancellationToken).AsTask();

    public async Task<IReadOnlyList<Resource>> ListByArrangementAsync(
        Guid arrangementId,
        CancellationToken cancellationToken)
    {
        return await _db.Resources
            .AsNoTracking()
            .Where(r => r.ArrangementId == arrangementId)
            .OrderBy(r => r.CreatedAt)
            .ThenBy(r => r.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<Resource?> GetByIdAsync(
        Guid arrangementId,
        Guid resourceId,
        CancellationToken cancellationToken)
        => _db.Resources.FirstOrDefaultAsync(
            r => r.ArrangementId == arrangementId && r.Id == resourceId,
            cancellationToken);

    public Task UpdateAsync(Resource resource, CancellationToken cancellationToken)
    {
        _db.Resources.Update(resource);
        return Task.CompletedTask;
    }

    public Task RemoveAsync(Resource resource, CancellationToken cancellationToken)
    {
        _db.Resources.Remove(resource);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
