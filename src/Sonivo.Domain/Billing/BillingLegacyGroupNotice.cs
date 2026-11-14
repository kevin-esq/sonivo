namespace Sonivo.Domain.Billing;

public sealed class BillingLegacyGroupNotice
{
    public Guid GroupId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }
    public DateTimeOffset? PurgeAt { get; set; }
    public DateTimeOffset? ExemptedAt { get; set; }
    public int Attempts { get; set; }
}
