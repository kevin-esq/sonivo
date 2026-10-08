namespace Sonivo.Application.Abstractions;

/// <summary>
/// Pushes a "your inbox changed" signal to one user over the realtime transport
/// (ADR-0077). Best effort: a transport failure must never fail the write that
/// produced the notification, so implementations should not throw.
/// </summary>
public interface INotificationPublisher
{
    Task PublishAsync(
        Guid userId,
        string kind,
        Guid? groupId,
        CancellationToken cancellationToken = default);
}
