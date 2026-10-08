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

    public async Task<(IReadOnlyList<GroupAuditEntry> Items, int Total)> QueryByGroupAsync(
        Guid groupId,
        string? action,
        Guid? actorUserId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        int skip,
        int take,
        CancellationToken cancellationToken)
    {
        var query = _db.GroupAuditLog
            .AsNoTracking()
            .Where(e => e.GroupId == groupId);

        if (!string.IsNullOrWhiteSpace(action))
        {
            var trimmed = action.Trim();
            query = query.Where(e => e.Action == trimmed);
        }

        if (actorUserId is { } actor)
        {
            query = query.Where(e => e.ActorUserId == actor);
        }

        if (from is { } fromValue)
        {
            query = query.Where(e => e.CreatedAt >= fromValue);
        }

        if (to is { } toValue)
        {
            query = query.Where(e => e.CreatedAt <= toValue);
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(e => e.CreatedAt)
            .Skip(Math.Max(0, skip))
            .Take(Math.Clamp(take, 1, 200))
            .ToListAsync(cancellationToken);

        return (items, total);
    }
}
