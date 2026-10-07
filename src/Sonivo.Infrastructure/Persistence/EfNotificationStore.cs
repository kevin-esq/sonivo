using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Notifications;

namespace Sonivo.Infrastructure.Persistence;

public sealed class EfNotificationStore : INotificationStore
{
    private readonly SonivoDbContext _db;

    public EfNotificationStore(SonivoDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(Notification notification, CancellationToken cancellationToken)
        => await _db.Notifications.AddAsync(notification, cancellationToken);

    public void AddRange(IEnumerable<Notification> notifications)
        => _db.Notifications.AddRange(notifications);

    public async Task<IReadOnlyList<Notification>> ListAsync(
        Guid userId,
        NotificationScope scope,
        Guid? groupId,
        int limit,
        CancellationToken cancellationToken)
        => await _db.Notifications
            .AsNoTracking()
            .Where(n => n.UserId == userId
                        && n.Scope == scope
                        && (scope != NotificationScope.Group || n.GroupId == groupId))
            .OrderByDescending(n => n.CreatedAt)
            .Take(Math.Clamp(limit, 1, 200))
            .ToListAsync(cancellationToken);

    public Task<int> CountUnreadAsync(
        Guid userId,
        NotificationScope scope,
        Guid? groupId,
        CancellationToken cancellationToken)
        => _db.Notifications
            .AsNoTracking()
            .CountAsync(
                n => n.UserId == userId
                     && n.Scope == scope
                     && n.ReadAt == null
                     && (scope != NotificationScope.Group || n.GroupId == groupId),
                cancellationToken);

    public Task<Notification?> GetOwnedAsync(Guid id, Guid userId, CancellationToken cancellationToken)
        => _db.Notifications.FirstOrDefaultAsync(
            n => n.Id == id && n.UserId == userId,
            cancellationToken);

    public async Task<int> MarkAllReadAsync(
        Guid userId,
        NotificationScope scope,
        Guid? groupId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
        => await _db.Notifications
            .Where(n => n.UserId == userId
                        && n.Scope == scope
                        && n.ReadAt == null
                        && (scope != NotificationScope.Group || n.GroupId == groupId))
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(n => n.ReadAt, now),
                cancellationToken);

    public Task SaveChangesAsync(CancellationToken cancellationToken)
        => _db.SaveChangesAsync(cancellationToken);
}
