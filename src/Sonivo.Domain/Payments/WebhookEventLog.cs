namespace Sonivo.Domain.Payments;

public class WebhookEventLog
{
    public Guid Id { get; set; }
    public string EventId { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public DateTime ProcessedAtUtc { get; set; }
}
