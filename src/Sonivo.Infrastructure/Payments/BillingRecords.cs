namespace Sonivo.Infrastructure.Payments;

public sealed class BillingGroup
{
    public Guid GroupId { get; set; }
    public Guid OrganizationId { get; set; }
    public string? LegacyPlanId { get; set; }
    public DateTimeOffset? LegacyGrantedAt { get; set; }
}

public sealed class BillingTrial
{
    public Guid OwnerUserId { get; set; }
    public Guid OrganizationId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
}

public sealed class BillingOperation
{
    public string Id { get; set; } = "";
    public Guid OrganizationId { get; set; }
    public string Kind { get; set; } = "";
    public string Fingerprint { get; set; } = "";
    public string? Result { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class BillingInboxEvent
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string Environment { get; set; } = "sandbox";
    public string? CustomerId { get; set; }
    public string? SubscriptionId { get; set; }
    public string? InvoiceId { get; set; }
    public string? PaymentIntentId { get; set; }
    public string? SetupIntentId { get; set; }
    public string? PaymentMethodId { get; set; }
    public long AmountMinor { get; set; }
    public string Currency { get; set; } = "mxn";
    public DateTimeOffset? PeriodStart { get; set; }
    public DateTimeOffset? PeriodEnd { get; set; }
    public DateTimeOffset EventAt { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? ProcessedAt { get; set; }
    public int Attempts { get; set; }
    public string? ErrorCode { get; set; }
}

public sealed class BillingAudit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrganizationId { get; set; }
    public Guid? ActorUserId { get; set; }
    public string Action { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
