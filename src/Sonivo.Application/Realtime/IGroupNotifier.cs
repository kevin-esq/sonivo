namespace Sonivo.Application.Realtime;

/// <summary>
/// Broadcasts a group data change to every connected member so other users see
/// it live (ADR-0074 §3/§6, extended to cross-user real time). Best-effort:
/// transports never fail the write that triggered them.
/// </summary>
public interface IGroupNotifier
{
    Task NotifyGroupChangedAsync(Guid groupId, string scope, CancellationToken cancellationToken = default);
}
