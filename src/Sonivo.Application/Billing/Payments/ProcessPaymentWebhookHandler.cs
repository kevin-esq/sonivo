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
    private readonly IGroupDataOperation _dataOperation;
    private readonly IGroupDatabaseScope _databaseScope;
    private readonly IClock _clock;

    public ProcessPaymentWebhookHandler(
        IPaymentProvider provider,
        IWebhookEventStore events,
        IGroupStore groups,
        IGroupDataOperation dataOperation,
        IGroupDatabaseScope databaseScope,
        IClock clock)
    {
        _provider = provider;
        _events = events;
        _groups = groups;
        _dataOperation = dataOperation;
        _databaseScope = databaseScope;
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

        var now = _clock.UtcNow;
        return await _dataOperation.ExecuteInTransactionAsync(async operationToken =>
        {
            // The provider has verified the signature, so the normalized GroupId
            // is a bounded selector for this one billing operation.
            if (webhook.GroupId is Guid groupId)
            {
                await _databaseScope.SetSignedPaymentWebhookGroupAsync(groupId, operationToken);
            }

            if (await _events.ExistsAsync(webhook.EventId, operationToken))
            {
                return new PaymentWebhookResult(Accepted: true, Duplicate: true, Reason: null);
            }

            if (webhook.GroupId is Guid verifiedGroupId)
            {
                var group = await _groups.GetByIdAsync(verifiedGroupId, operationToken);
                if (group is not null)
                {
                    Apply(group, webhook, now);
                    await _groups.UpdateAsync(group, operationToken);
                }
            }

            await _events.RecordAsync(webhook.EventId, webhook.EventType, now, operationToken);
            return new PaymentWebhookResult(Accepted: true, Duplicate: false, Reason: null);
        }, cancellationToken);
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
