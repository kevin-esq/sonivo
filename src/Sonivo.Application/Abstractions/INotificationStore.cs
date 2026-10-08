using Sonivo.Domain.Notifications;

namespace Sonivo.Application.Abstractions;

/// <summary>
/// In-app notification inbox (ADR-0077). Always scoped to the recipient user and,
/// for group notifications, to a single group.
/// </summary>
public interface INotificationStore
{
    Task AddAsync(Notification notification, CancellationToken cancellationToken);

    void AddRange(IEnumerable<Notification> notifications);

    /// <summary>Newest first, for one recipient + scope (+ group when group-scoped).</summary>
    Task<IReadOnlyList<Notification>> ListAsync(
        Guid userId,
        NotificationScope scope,
        Guid? groupId,
        int limit,
        CancellationToken cancellationToken);

    Task<int> CountUnreadAsync(
        Guid userId,
        NotificationScope scope,
        Guid? groupId,
        CancellationToken cancellationToken);

    /// <summary>A single notification owned by the user, or null.</summary>
    Task<Notification?> GetOwnedAsync(Guid id, Guid userId, CancellationToken cancellationToken);

    Task<int> MarkAllReadAsync(
        Guid userId,
        NotificationScope scope,
        Guid? groupId,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
