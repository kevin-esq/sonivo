namespace Sonivo.Domain.Billing;

/// <summary>A financial container; membership in this container never grants Group access.</summary>
public sealed class BillingOrganization
{
    public Guid Id { get; private set; }
    public Guid OwnerUserId { get; private set; }
    public Guid? PrimaryGroupId { get; private set; }
    public string Provider { get; private set; } = "stripe";
    public string Environment { get; private set; } = "sandbox";
    public string? CustomerId { get; private set; }
    public string? SubscriptionId { get; private set; }
    public string PlanId { get; private set; } = PlanCatalog.Starter;
    public string Interval { get; private set; } = "month";
    public string Status { get; private set; } = "inactive";
    public DateTimeOffset? PeriodEndsAt { get; private set; }
    public DateTimeOffset? TrialEndsAt { get; private set; }
    public DateTimeOffset? PastDueSince { get; private set; }
    public bool CancelAtPeriodEnd { get; private set; }
    public int ExtraGroups { get; private set; }
    public string? ScheduledPlanId { get; set; }
    public string? ScheduledInterval { get; set; }
    public int? ScheduledExtraGroups { get; set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public int Version { get; private set; }

    private BillingOrganization() { }

    public static BillingOrganization Create(Guid ownerUserId, Guid primaryGroupId, DateTimeOffset now, string environment = "sandbox")
    {
        if (ownerUserId == Guid.Empty || primaryGroupId == Guid.Empty || environment is not ("sandbox" or "live"))
            throw new ArgumentException("A valid billing owner, Group and environment are required.");
        return new() { Id = Guid.NewGuid(), OwnerUserId = ownerUserId, PrimaryGroupId = primaryGroupId,
            Environment = environment, CreatedAt = now, UpdatedAt = now, Version = 1 };
    }

    public static BillingOrganization Create(Guid ownerUserId, DateTimeOffset now, string environment = "sandbox")
    {
        if (ownerUserId == Guid.Empty || environment is not ("sandbox" or "live"))
            throw new ArgumentException("A valid billing owner and environment are required.");
        return new() { Id = Guid.NewGuid(), OwnerUserId = ownerUserId, PrimaryGroupId = null,
            Environment = environment, CreatedAt = now, UpdatedAt = now, Version = 1 };
    }

    public void AssignPrimaryGroup(Guid groupId, DateTimeOffset now)
    {
        if (groupId == Guid.Empty || PrimaryGroupId is not null)
            throw new InvalidOperationException("Primary Group is already assigned or invalid.");
        PrimaryGroupId = groupId; UpdatedAt = now; Version++;
    }

    public void SetCustomer(string customerId)
    {
        if (string.IsNullOrWhiteSpace(customerId) || (CustomerId is not null && CustomerId != customerId))
            throw new InvalidOperationException("Billing customer cannot be replaced.");
        CustomerId = customerId;
    }

    public void StartTrial(string planId, DateTimeOffset end, DateTimeOffset now)
    {
        if (Status != "inactive" || TrialEndsAt is not null || SubscriptionId is not null)
            throw new InvalidOperationException("Trial has already been used.");
        if (planId != PlanCatalog.Pro) throw new ArgumentException("Only the Pro plan includes a trial.", nameof(planId));
        ValidatePlan(planId, "month", 0);
        if (end <= now || end > now.AddDays(14)) throw new ArgumentException("Invalid trial end.");
        PlanId = planId; Status = "trialing"; TrialEndsAt = end;
        UpdatedAt = now; Version++;
    }

    public void ApplySubscription(string subscriptionId, string planId, string interval, string status,
        DateTimeOffset? periodEnd, DateTimeOffset? trialEnd, bool cancelAtPeriodEnd, int extraGroups, DateTimeOffset now)
    {
        ValidatePlan(planId, interval, extraGroups);
        if (string.IsNullOrWhiteSpace(subscriptionId) || (SubscriptionId is not null && SubscriptionId != subscriptionId
            && Status is not ("canceled" or "incomplete_expired")))
            throw new InvalidOperationException("Subscription does not match the billing account.");
        if (status is not ("active" or "trialing" or "past_due" or "unpaid" or "canceled" or "incomplete" or "incomplete_expired" or "paused"))
            throw new ArgumentException("Unknown subscription status.");
        DateTimeOffset? pastDueSince = status == "past_due" ? PastDueSince ?? now : null;
        if (SubscriptionId == subscriptionId && PlanId == planId && Interval == interval && Status == status
            && PeriodEndsAt == periodEnd && TrialEndsAt == trialEnd && CancelAtPeriodEnd == cancelAtPeriodEnd
            && ExtraGroups == extraGroups && PastDueSince == pastDueSince) return;
        SubscriptionId = subscriptionId; PlanId = planId; Interval = interval; Status = status;
        PeriodEndsAt = periodEnd; TrialEndsAt = trialEnd; CancelAtPeriodEnd = cancelAtPeriodEnd; ExtraGroups = extraGroups;
        PastDueSince = pastDueSince;
        UpdatedAt = now; Version++;
    }

    public bool CanCreate(DateTimeOffset now) => Status switch
    {
        "active" => PeriodEndsAt is { } end && end > now,
        "trialing" => TrialEndsAt is { } trial && trial > now,
        "past_due" => PastDueSince is { } due && now < due.AddDays(7),
        _ => false
    };

    public void SuspendForReview(DateTimeOffset now)
    {
        if (Status == "paused") return;
        Status = "paused"; UpdatedAt = now; Version++;
    }

    public string EffectivePlan(DateTimeOffset now) => CanCreate(now) ? PlanId : PlanCatalog.Starter;
    public int GroupCapacity(DateTimeOffset now) => EffectivePlan(now) == PlanCatalog.Studio ? 3 + ExtraGroups : 1;

    public static void ValidatePlan(string planId, string interval, int extraGroups)
    {
        if (!PlanCatalog.IsKnown(planId) || interval != "month" || extraGroups != 0)
            throw new ArgumentException("Invalid plan, interval or extra Group quantity.");
    }
}

public static class BillingPrices
{
    public static long Amount(string planId, string interval)
    {
        BillingOrganization.ValidatePlan(planId, interval, 0);
        return PlanCatalog.Get(planId).PriceMonthlyMxn * 100L;
    }
}
