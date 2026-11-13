namespace Sonivo.Domain.Billing;

public sealed record BillingReferralRewardSchedule(DateTimeOffset ProposedFreeThrough,
    DateTimeOffset RewardBasePeriodEnd, DateTimeOffset RetryAt, bool IsCapped);

public static class BillingReferralRewardPolicy
{
    public static BillingReferralRewardSchedule Calculate(DateTimeOffset now, DateTimeOffset paidThrough,
        DateTimeOffset? trialEnd, DateTimeOffset? existingFreeThrough, DateTimeOffset? rewardBasePeriodEnd,
        int rewardDays)
    {
        if (rewardDays != 30) throw new ArgumentOutOfRangeException(nameof(rewardDays));
        var currentEnd = new[] { paidThrough, trialEnd, existingFreeThrough }.Where(x => x is not null)
            .Select(x => x!.Value).Max();
        var rewardBase = rewardBasePeriodEnd ?? paidThrough;
        var proposed = currentEnd.AddDays(rewardDays);
        var capStart = rewardBase > now ? rewardBase : now;
        var capped = proposed - capStart > TimeSpan.FromDays(12 * 30);
        var retryAt = currentEnd.AddDays(-330);
        return new(proposed, rewardBase, retryAt < now ? now : retryAt, capped);
    }
}

public sealed class BillingReferralCode
{
    public Guid OrganizationId { get; set; }
    public string Environment { get; set; } = "sandbox";
    public string Code { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class BillingReferralAttribution
{
    public Guid ReferredOrganizationId { get; set; }
    public Guid ReferrerOrganizationId { get; set; }
    public string Code { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public string? QualifiedInvoiceId { get; set; }
    public string? QualifiedEventId { get; set; }
}

public sealed class BillingReferralReward
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ReferrerOrganizationId { get; set; }
    public Guid ReferredOrganizationId { get; set; }
    public string Environment { get; set; } = "sandbox";
    public string InvoiceId { get; set; } = "";
    public string EventId { get; set; } = "";
    public int Days { get; set; } = 30;
    public string Status { get; set; } = "pending";
    public string? PendingReason { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? AppliedAt { get; set; }
    public DateTimeOffset? FreeThrough { get; set; }
    public DateTimeOffset? RewardBasePeriodEnd { get; set; }
    public DateTimeOffset? TargetFreeThrough { get; set; }
    public DateTimeOffset? ProcessingUntil { get; set; }
    public int Attempts { get; set; }
}

public sealed class BillingFinancialEvent
{
    public string Environment { get; set; } = "sandbox";
    public string EventId { get; set; } = "";
    public Guid OrganizationId { get; set; }
    public string EventType { get; set; } = "";
    public string? SubscriptionId { get; set; }
    public string? InvoiceId { get; set; }
    public string? PaymentIntentId { get; set; }
    public string? RefundId { get; set; }
    public string? DisputeId { get; set; }
    public long AmountMinor { get; set; }
    public string Currency { get; set; } = "mxn";
    public string Status { get; set; } = "";
    public DateTimeOffset? PeriodStart { get; set; }
    public DateTimeOffset? PeriodEnd { get; set; }
    public DateTimeOffset EventAt { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
}

public sealed class BillingAccountingOutbox
{
    public string EventId { get; set; } = "";
    public string Environment { get; set; } = "sandbox";
    public Guid OrganizationId { get; set; }
    public string Payload { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
    public int Attempts { get; set; }
}
