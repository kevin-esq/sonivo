using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Billing.Payments;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Billing.Payments;

/// <summary>Outcome of processing a provider webhook.</summary>
public sealed record PaymentWebhookResult(bool Accepted, bool Duplicate, string? Reason);

/// <summary>
/// Verifies and applies a payment-provider webhook (ADR-0073 §9.13). The flow is
/// intentionally gateway-agnostic and secure by construction:
/// 1. the provider verifies the signature (secret from configuration) and
///    normalizes the event, so the raw body is never trusted;
/// 2. an event id is processed at most once via <see cref="IWebhookEventStore"/>
///    (idempotency — replayed deliveries are acknowledged, not re-applied);
/// 3. only the normalized status/plan is applied to the group's billing lifecycle.
/// </summary>
public sealed class ProcessPaymentWebhookHandler
{
    private readonly IPaymentProvider _provider;
    private readonly IWebhookEventStore _events;
    private readonly IGroupStore _groups;
    private readonly IClock _clock;

    public ProcessPaymentWebhookHandler(
        IPaymentProvider provider,
        IWebhookEventStore events,
        IGroupStore groups,
        IClock clock)
    {
        _provider = provider;
        _events = events;
        _groups = groups;
        _clock = clock;
    }

    public async Task<PaymentWebhookResult> HandleAsync(
        string payload,
        string? signatureHeader,
        CancellationToken cancellationToken)
    {
        var webhook = _provider.VerifyWebhook(payload, signatureHeader);
        if (webhook is null)
        {
            return new PaymentWebhookResult(Accepted: false, Duplicate: false, Reason: "invalid-signature");
        }

        if (await _events.ExistsAsync(webhook.EventId, cancellationToken))
        {
            return new PaymentWebhookResult(Accepted: true, Duplicate: true, Reason: null);
        }

        var now = _clock.UtcNow;
        if (webhook.GroupId is Guid groupId)
        {
            var group = await _groups.GetByIdAsync(groupId, cancellationToken);
            if (group is not null)
            {
                Apply(group, webhook, now);
                await _groups.UpdateAsync(group, cancellationToken);
            }
        }

        await _events.RecordAsync(webhook.EventId, webhook.EventType, now, cancellationToken);
        return new PaymentWebhookResult(Accepted: true, Duplicate: false, Reason: null);
    }

    private static void Apply(Group group, VerifiedWebhook webhook, DateTimeOffset now)
    {
        switch (webhook.Status)
        {
            case BillingStatuses.Active:
                if (PlanCatalog.IsKnown(webhook.PlanId))
                {
                    group.AssignPlan(webhook.PlanId!, now);
                }

                break;
            case BillingStatuses.Trialing:
                if (PlanCatalog.IsKnown(webhook.PlanId))
                {
                    group.StartTrial(webhook.PlanId!, now);
                }

                break;
            case BillingStatuses.PastDue:
                group.MarkPastDue(now);
                break;
            case BillingStatuses.ReadOnly:
            case "canceled":
                group.EnterReadOnly(now);
                break;
        }

        // A cancellation at period end schedules the group back to Starter without
        // deleting anything (PHASE-PLANS-SPEC §4.3; data is kept).
        if (webhook.CancelAtPeriodEnd)
        {
            group.SchedulePlanChange(PlanCatalog.Starter, now);
        }
    }
}
