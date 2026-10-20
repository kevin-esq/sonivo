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
    private readonly ILogger<SignalRNotificationPublisher> _logger;

    public SignalRNotificationPublisher(
        IHubContext<NotificationHub> hub,
        ILogger<SignalRNotificationPublisher> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public async Task PublishAsync(
        Guid userId,
        string kind,
        Guid? groupId,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await _hub.Clients
                .Group(NotificationHub.UserGroup(userId))
                .SendAsync("NotificationCreated", new { kind, groupId }, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Notification push failed for {UserId} ({Kind})", userId, kind);
        }
    }
}
