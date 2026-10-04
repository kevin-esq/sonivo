namespace Sonivo.Application.Abstractions;

/// <summary>
/// ADR-0052: event/RSVP notifications. Best-effort and flag-gated
/// (<c>Features:Notifications</c>); a transport failure must never fail the
/// domain request. Members without an email are not reached (in-app/ICS only).
/// </summary>
public interface IEventNotifier
{
    Task EventChangedAsync(
        Guid groupId,
        Guid eventId,
        string title,
        DateTimeOffset startsAt,
        string change,
        CancellationToken cancellationToken);

    Task RsvpChangedAsync(
        Guid groupId,
        Guid eventId,
        Guid userId,
        string response,
        string title,
        DateTimeOffset startsAt,
        CancellationToken cancellationToken);
}

public static class EventNotificationChanges
{
    public const string Created = "created";
    public const string Updated = "updated";
    public const string Cancelled = "cancelled";
    public const string Deleted = "deleted";
}
