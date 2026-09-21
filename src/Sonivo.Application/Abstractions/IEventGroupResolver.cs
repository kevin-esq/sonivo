namespace Sonivo.Application.Abstractions;

/// <summary>
/// Resolves the owning Group of an Event by id alone (ADR-0036).
/// The Hub must never trust a client-supplied group id — the group is
/// always derived server-side from the Event.
/// </summary>
public interface IEventGroupResolver
{
    Task<Guid?> FindGroupIdByEventIdAsync(Guid eventId, CancellationToken cancellationToken);
}
