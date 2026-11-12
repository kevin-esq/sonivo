using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;

namespace Sonivo.Infrastructure.Payments;

public sealed partial class StripeBillingService
{
    public Task<bool> ReceiveAsync(string body, string signature, CancellationToken ct) => data.ExecuteInTransactionAsync(async token =>
    {
        var verified = gateway.VerifyEvent(body, signature);
        if (verified is null) return false;
        await LockAsync(GuidFromEvent(verified.Id), token);
        if (await db.BillingInbox.AnyAsync(x => x.Id == verified.Id && x.Environment == gateway.Environment, token)) return true;
        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        var obj = document.RootElement.GetProperty("data").GetProperty("object");
        var invoicePeriod = InvoicePeriod(obj);
        var subscriptionId = verified.Type.StartsWith("customer.subscription.", StringComparison.Ordinal)
            ? StripeBillingGateway.Text(obj, "id") : InvoiceSubscriptionId(obj);
        db.BillingInbox.Add(new()
        {
            Id = verified.Id, Type = verified.Type, Environment = gateway.Environment,
            CustomerId = StripeBillingGateway.Text(obj, "customer"),
            SubscriptionId = subscriptionId,
            InvoiceId = verified.Type.StartsWith("invoice.", StringComparison.Ordinal) ? StripeBillingGateway.Text(obj, "id") : null,
            PaymentIntentId = StripeBillingGateway.Text(obj, "payment_intent"),
            SetupIntentId = verified.Type.StartsWith("setup_intent.", StringComparison.Ordinal)
                ? StripeBillingGateway.Text(obj, "id") : null,
            PaymentMethodId = verified.Type == "setup_intent.succeeded"
                ? StripeBillingGateway.Text(obj, "payment_method") : null,
            AmountMinor = Number(obj, "amount_paid") ?? Number(obj, "amount_due") ?? Number(obj, "amount_refunded") ?? 0,
            Currency = StripeBillingGateway.Text(obj, "currency")?.ToLowerInvariant() ?? "mxn",
            PeriodStart = invoicePeriod.Start, PeriodEnd = invoicePeriod.End,
            EventAt = DateTimeOffset.FromUnixTimeSeconds(Number(root, "created") ?? clock.UtcNow.ToUnixTimeSeconds()),
            ReceivedAt = clock.UtcNow, NextAttemptAt = clock.UtcNow
        });
        await db.SaveChangesAsync(token);
        return true;
    }, ct);

    private static Guid GuidFromEvent(string id) => new(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(id)).AsSpan(0, 16));

    internal async Task ProcessEventAsync(string eventId, CancellationToken ct)
    {
        await data.ExecuteInTransactionAsync(async token =>
        {
            await LockAsync(GuidFromEvent(eventId), token);
            var ev = await db.BillingInbox.SingleAsync(x => x.Id == eventId && x.Environment == gateway.Environment, token);
            if (ev.ProcessedAt is not null || ev.Attempts >= 10) return true;
            var organization = ev.CustomerId is null ? null : await db.BillingOrganizations.SingleOrDefaultAsync(
                x => x.CustomerId == ev.CustomerId && x.Environment == ev.Environment, token);
            if (organization is null) throw new ConflictException("billing-unmapped-customer");
            await LockAsync(organization.Id, token);
            await db.Entry(organization).ReloadAsync(token);
            if (ev.Type == "setup_intent.succeeded" && ev.SetupIntentId is { } setupIntentId
                && await ApplyPaymentMethodAsync(organization, setupIntentId, token) is not null)
                Audit(organization.Id, null, "payment-method-updated");
            if (ev.Type is "charge.refunded" or "charge.dispute.created" or "radar.early_fraud_warning.created")
                Audit(organization.Id, null, "review:" + ev.Type);
            await RecordFinancialEventAsync(organization, ev, token);
            await db.SaveChangesAsync(token);
            if (ev.Type == "invoice.paid" && ev.AmountMinor > 0 && ev.SubscriptionId is not null)
                await QueueReferralRewardAsync(organization, ev, token);
            await ReconcileAsync(organization, token);
            ev.ProcessedAt = clock.UtcNow;
            ev.ErrorCode = null;
            await db.SaveChangesAsync(token);
            return true;
        }, ct);
    }

    internal Task RefreshAsync(Guid organizationId, CancellationToken ct) => data.ExecuteInTransactionAsync(async token =>
    {
        await LockAsync(organizationId, token);
        var organization = await db.BillingOrganizations.SingleAsync(x => x.Id == organizationId, token);
        await ReconcileAsync(organization, token);
        await db.SaveChangesAsync(token);
        return true;
    }, ct);

    internal async Task ReconcileAsync(BillingOrganization organization, CancellationToken ct)
    {
        if (organization.CustomerId is null)
        {
            await ProjectGroupsAsync(organization, ct);
            return;
        }
        JsonElement subscription;
        if (organization.SubscriptionId is { } id && organization.Status is not ("canceled" or "incomplete_expired"))
            subscription = await gateway.GetAsync($"/v1/subscriptions/{id}", ct);
        else
        {
            var list = await gateway.GetAsync($"/v1/subscriptions?customer={Uri.EscapeDataString(organization.CustomerId)}&status=all&limit=10", ct);
            var subscriptions = list.GetProperty("data").EnumerateArray().Where(x => StripeBillingGateway.Text(x, "status") is "active" or "trialing" or "past_due" or "unpaid" or "incomplete").ToArray();
            if (subscriptions.Length == 0) { await ProjectGroupsAsync(organization, ct); return; }
            if (subscriptions.Length != 1 || list.TryGetProperty("has_more", out var more) && more.GetBoolean())
            { await SuspendAsync(organization, "multiple-subscriptions", ct); return; }
            subscription = subscriptions[0];
        }
        if (StripeBillingGateway.Text(subscription, "customer") != organization.CustomerId)
        { await SuspendAsync(organization, "customer-mismatch", ct); return; }
        var items = subscription.GetProperty("items").GetProperty("data").EnumerateArray().ToArray();
        if (items.Length is < 1 or > 2) { await SuspendAsync(organization, "items-unrecognized", ct); return; }
        var baseItem = items.SingleOrDefault(item => TryResolvePrice(item.GetProperty("price").GetProperty("id").GetString()!, out _, out _));
        if (baseItem.ValueKind == JsonValueKind.Undefined || !TryResolvePrice(baseItem.GetProperty("price").GetProperty("id").GetString()!, out var plan, out var interval)
            || baseItem.GetProperty("quantity").GetInt64() != 1)
        { await SuspendAsync(organization, "price-unrecognized", ct); return; }
        if (items.Length != 1) { await SuspendAsync(organization, "addon-unavailable", ct); return; }
        organization.ApplySubscription(subscription.GetProperty("id").GetString()!, plan, interval,
            subscription.GetProperty("status").GetString()!, StripeBillingGateway.Timestamp(baseItem, "current_period_end"),
            StripeBillingGateway.Timestamp(subscription, "trial_end"), subscription.GetProperty("cancel_at_period_end").GetBoolean(), 0, clock.UtcNow);
        if (organization.PlanId == organization.ScheduledPlanId && organization.Interval == organization.ScheduledInterval && organization.ExtraGroups == organization.ScheduledExtraGroups)
        { organization.ScheduledPlanId = null; organization.ScheduledInterval = null; organization.ScheduledExtraGroups = null; }
        await ProjectGroupsAsync(organization, ct);
    }

    private async Task SuspendAsync(BillingOrganization organization, string reason, CancellationToken ct)
    {
        organization.SuspendForReview(clock.UtcNow);
        Audit(organization.Id, null, "review:" + reason);
        await ProjectGroupsAsync(organization, ct);
    }

    private bool TryResolvePrice(string id, out string plan, out string interval)
    {
        foreach (var p in new[] { PlanCatalog.Starter, PlanCatalog.Pro, PlanCatalog.Studio })
        foreach (var i in new[] { "month", "year" })
        {
            try { if (gateway.PriceId(p, i) == id) { plan = p; interval = i; return true; } }
            catch (ValidationException) { }
        }
        plan = ""; interval = ""; return false;
    }

    private async Task ProjectGroupsAsync(BillingOrganization organization, CancellationToken ct)
    {
        var links = await db.BillingGroups.Where(x => x.OrganizationId == organization.Id).ToListAsync(ct);
        foreach (var link in links)
        {
            await scope.SetSignedPaymentWebhookGroupAsync(link.GroupId, ct);
            var group = await db.Groups.SingleOrDefaultAsync(x => x.Id == link.GroupId, ct);
            if (group is null) continue;
            var activeGrant = await BillingProjection.ActiveGrantAsync(db, organization.Id, clock.UtcNow, ct);
            BillingProjection.Apply(group, link, organization, clock.UtcNow, activeGrant);
        }
    }

    private static long? Number(JsonElement value, string name)
        => value.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.Number
            ? field.GetInt64() : null;

    private static (DateTimeOffset? Start, DateTimeOffset? End) InvoicePeriod(JsonElement invoice)
    {
        if (!invoice.TryGetProperty("lines", out var lines) || !lines.TryGetProperty("data", out var data))
            return (StripeBillingGateway.Timestamp(invoice, "period_start"),
                StripeBillingGateway.Timestamp(invoice, "period_end"));
        var periods = data.EnumerateArray().Select(x => x.TryGetProperty("period", out var period)
            ? (Start: StripeBillingGateway.Timestamp(period, "start"), End: StripeBillingGateway.Timestamp(period, "end"))
            : (Start: (DateTimeOffset?)null, End: (DateTimeOffset?)null)).ToArray();
        var starts = periods.Where(x => x.Start is not null).Select(x => x.Start!.Value).ToArray();
        var ends = periods.Where(x => x.End is not null).Select(x => x.End!.Value).ToArray();
        return (starts.Length == 0 ? null : starts.Min(), ends.Length == 0 ? null : ends.Max());
    }

    private static string? InvoiceSubscriptionId(JsonElement invoice)
    {
        if (StripeBillingGateway.Text(invoice, "subscription") is { } direct) return direct;
        return invoice.TryGetProperty("parent", out var parent)
            && parent.TryGetProperty("subscription_details", out var details)
            ? StripeBillingGateway.Text(details, "subscription") : null;
    }

    private async Task RecordFinancialEventAsync(BillingOrganization organization, BillingInboxEvent inbox,
        CancellationToken ct)
    {
        if (inbox.Type is not ("invoice.paid" or "invoice.payment_failed" or "charge.refunded"
            or "charge.dispute.created" or "radar.early_fraud_warning.created")) return;
        if (await db.BillingFinancialEvents.AnyAsync(x => x.Environment == inbox.Environment
            && x.EventId == inbox.Id, ct)) return;
        var record = new BillingFinancialEvent
        {
            Environment = inbox.Environment, EventId = inbox.Id, OrganizationId = organization.Id,
            EventType = inbox.Type, SubscriptionId = inbox.SubscriptionId, InvoiceId = inbox.InvoiceId, PaymentIntentId = inbox.PaymentIntentId,
            RefundId = inbox.Type == "charge.refunded" ? inbox.Id : null,
            DisputeId = inbox.Type == "charge.dispute.created" ? inbox.Id : null,
            AmountMinor = inbox.AmountMinor, Currency = inbox.Currency,
            Status = inbox.Type == "invoice.paid" ? "paid" : inbox.Type,
            PeriodStart = inbox.PeriodStart, PeriodEnd = inbox.PeriodEnd,
            EventAt = inbox.EventAt, RecordedAt = clock.UtcNow
        };
        db.BillingFinancialEvents.Add(record);
        db.BillingAccountingOutbox.Add(new BillingAccountingOutbox
        {
            EventId = inbox.Id, Environment = inbox.Environment, OrganizationId = organization.Id,
            Payload = JsonSerializer.Serialize(new
            {
                event_id = inbox.Id, event_type = inbox.Type, event_at = inbox.EventAt,
                product_id = "sonivo", organization_id = organization.Id,
                stripe_customer_id = organization.CustomerId, stripe_subscription_id = inbox.SubscriptionId,
                stripe_invoice_id = inbox.InvoiceId, stripe_payment_intent_id = inbox.PaymentIntentId,
                stripe_refund_id = record.RefundId, stripe_dispute_id = record.DisputeId,
                amount_minor = inbox.AmountMinor, currency = inbox.Currency, status = record.Status,
                period_start = inbox.PeriodStart, period_end = inbox.PeriodEnd
            }),
            CreatedAt = clock.UtcNow, NextAttemptAt = clock.UtcNow
        });
    }

    private async Task QueueReferralRewardAsync(BillingOrganization referred, BillingInboxEvent inbox,
        CancellationToken ct)
    {
        var attribution = await db.BillingReferralAttributions.SingleOrDefaultAsync(
            x => x.ReferredOrganizationId == referred.Id, ct);
        if (attribution is null) return;
        if (inbox.EventAt <= attribution.CreatedAt) return;
        if (referred.CustomerId is null) return;
        var firstPaidInvoice = await FindFirstPositivePaidSubscriptionInvoiceAsync(referred.CustomerId, ct);
        if (firstPaidInvoice is null)
            throw new ConflictException("billing-referral-payment-history-incomplete");
        if (firstPaidInvoice.InvoiceId != inbox.InvoiceId || firstPaidInvoice.PaidAt <= attribution.CreatedAt) return;
        var firstInvoice = await db.BillingFinancialEvents.AsNoTracking()
            .Where(x => x.OrganizationId == referred.Id && x.EventType == "invoice.paid"
                && x.AmountMinor > 0 && x.SubscriptionId != null && x.InvoiceId != null)
            .OrderBy(x => x.EventAt).ThenBy(x => x.EventId)
            .Select(x => new { x.InvoiceId, x.EventId }).FirstOrDefaultAsync(ct);
        if (firstInvoice is null) return;
        attribution.QualifiedInvoiceId = firstInvoice.InvoiceId;
        attribution.QualifiedEventId = firstInvoice.EventId;
        var existing = await db.BillingReferralRewards.SingleOrDefaultAsync(x => x.ReferredOrganizationId == referred.Id, ct);
        if (existing is not null)
        {
            if (existing.Status == "pending")
            { existing.InvoiceId = firstInvoice.InvoiceId!; existing.EventId = firstInvoice.EventId; }
            return;
        }
        db.BillingReferralRewards.Add(new BillingReferralReward
        {
            ReferrerOrganizationId = attribution.ReferrerOrganizationId,
            ReferredOrganizationId = referred.Id, Environment = inbox.Environment,
            InvoiceId = firstInvoice.InvoiceId!, EventId = firstInvoice.EventId, Days = 30,
            Status = "pending", PendingReason = "awaiting-safe-renewal",
            CreatedAt = clock.UtcNow, NextAttemptAt = clock.UtcNow
        });
    }
}
