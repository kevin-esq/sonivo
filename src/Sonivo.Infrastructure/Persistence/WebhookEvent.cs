namespace Sonivo.Infrastructure.Persistence;

/// <summary>
/// Idempotency ledger for payment webhooks (ADR-0073 firewall). The provider
/// event id is the key; a replayed delivery is acknowledged without re-applying
/// effects. Not the removed insecure scaffold — this stores only ids/types.
/// </summary>
public sealed class WebhookEvent
{
    public string EventId { get; private set; } = string.Empty;
    public string EventType { get; private set; } = string.Empty;
    public DateTimeOffset ReceivedAt { get; private set; }

    private WebhookEvent()
    {
    }

    public static WebhookEvent Create(string eventId, string eventType, DateTimeOffset receivedAt) =>
        new()
        {
            EventId = eventId,
            EventType = eventType,
            ReceivedAt = receivedAt
        };
}
