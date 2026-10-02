using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfGroupAuditStore : IGroupAuditStore
{
    private readonly SonivoDbContext _db;

    public EfGroupAuditStore(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(GroupAuditEntry entry, CancellationToken cancellationToken)
        => await _db.GroupAuditLog.AddAsync(entry, cancellationToken);

    public async Task<IReadOnlyList<GroupAuditEntry>> ListByGroupAsync(
        Guid groupId,
        int limit,
        CancellationToken cancellationToken)
        => await _db.GroupAuditLog
            .AsNoTracking()
            .Where(e => e.GroupId == groupId)
            .OrderByDescending(e => e.CreatedAt)
            .Take(Math.Clamp(limit, 1, 500))
            .ToListAsync(cancellationToken);

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
