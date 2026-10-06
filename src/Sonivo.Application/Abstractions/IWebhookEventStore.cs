namespace Sonivo.Application.Abstractions;

/// <summary>
/// Idempotency ledger for payment webhooks (ADR-0073 firewall: a real gateway
/// design requires idempotency). Each provider event id is processed at most
/// once; replays are acknowledged without re-applying effects.
/// </summary>
public interface IWebhookEventStore
{
    Task<bool> ExistsAsync(string eventId, CancellationToken cancellationToken);

    Task RecordAsync(string eventId, string eventType, DateTimeOffset receivedAt, CancellationToken cancellationToken);
}
