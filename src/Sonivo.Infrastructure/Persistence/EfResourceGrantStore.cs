using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

/// <summary>
/// EF implementation of per-song overrides (ADR-0080). Every query is scoped by
/// (GroupId, UserId) — there is deliberately no unscoped lookup, so a grant can
/// never be read across the tenancy boundary.
/// </summary>
public sealed class EfResourceGrantStore : IResourceGrantStore
{
    private readonly SonivoDbContext _db;

    public EfResourceGrantStore(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<ResourceGrant>> ListForUserAsync(
        Guid groupId,
        Guid userId,
        CancellationToken cancellationToken)
        => await _db.ResourceGrants
            .Where(g => g.GroupId == groupId && g.UserId == userId)
            .OrderBy(g => g.ResourceType)
            .ThenBy(g => g.ResourceId)
            .ToListAsync(cancellationToken);

    public async Task<ResourceGrant?> FindAsync(
        Guid groupId,
        Guid userId,
        string resourceType,
        Guid resourceId,
        CancellationToken cancellationToken)
        => await _db.ResourceGrants.FirstOrDefaultAsync(
            g => g.GroupId == groupId
                && g.UserId == userId
                && g.ResourceType == resourceType
                && g.ResourceId == resourceId,
            cancellationToken);

    public async Task AddAsync(ResourceGrant grant, CancellationToken cancellationToken)
        => await _db.ResourceGrants.AddAsync(grant, cancellationToken);

    public void Remove(ResourceGrant grant) => _db.ResourceGrants.Remove(grant);

    public async Task RemoveAsync(
        Guid groupId,
        Guid userId,
        string resourceType,
        Guid resourceId,
        CancellationToken cancellationToken)
    {
        var existing = await FindAsync(groupId, userId, resourceType, resourceId, cancellationToken);
        if (existing is not null)
        {
            _db.ResourceGrants.Remove(existing);
        }
    }

    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken)
        => await _db.SaveChangesAsync(cancellationToken);
}
