namespace Sonivo.Application.Abstractions;

/// <summary>
/// ADR-0047 / privacy §13: when a member becomes Owner, the group's reset power
/// over its managed accounts changes hands. Members are notified (email when
/// available) and the change is audited by the caller.
/// </summary>
public interface IManagedAccountNotifier
{
    Task NotifyOwnerChangedAsync(
        Guid groupId,
        Guid newOwnerUserId,
        CancellationToken cancellationToken);
}
