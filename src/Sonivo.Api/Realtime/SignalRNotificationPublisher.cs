using Microsoft.AspNetCore.SignalR;
using Sonivo.Application.Abstractions;

namespace Sonivo.Api.Realtime;

/// <summary>
/// Self-hosted in-process SignalR implementation of <see cref="INotificationPublisher"/>.
/// Sends the new-notification signal to the recipient's private group only.
/// </summary>
public sealed class SignalRNotificationPublisher : INotificationPublisher
{
    private readonly IHubContext<NotificationHub> _hub;

    public SignalRNotificationPublisher(IHubContext<NotificationHub> hub)
    {
        _hub = hub;
    }

    public Task PublishAsync(
        Guid userId,
        string kind,
        Guid? groupId,
        CancellationToken cancellationToken = default)
        => _hub.Clients
            .Group(NotificationHub.UserGroup(userId))
            .SendAsync("NotificationCreated", new { kind, groupId }, cancellationToken);
}
