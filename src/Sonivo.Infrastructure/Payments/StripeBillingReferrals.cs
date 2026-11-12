using System.Security.Cryptography;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;
using Sonivo.Domain.Billing;

namespace Sonivo.Infrastructure.Payments;

public sealed partial class StripeBillingService
{
    private const string ReferralCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    internal async Task ProcessReferralRewardAsync(Guid rewardId, CancellationToken ct)
    {
        if (!gateway.ReferralRewardsEnabled) return;
        var claim = await data.ExecuteInTransactionAsync(async token =>
        {
            var candidate = await db.BillingReferralRewards.SingleOrDefaultAsync(x => x.Id == rewardId, token);
            if (candidate is null || candidate.Status == "applied") return null;
            var now = clock.UtcNow;
            if (candidate.NextAttemptAt > now || candidate.ProcessingUntil > now) return null;
            await LockAsync(candidate.ReferrerOrganizationId, token);
            var busy = await db.BillingReferralRewards.AnyAsync(x => x.ReferrerOrganizationId == candidate.ReferrerOrganizationId
                && x.Id != candidate.Id && x.Status == "processing" && x.ProcessingUntil > now, token);
            if (busy) return null;
            candidate.Status = "processing";
            candidate.PendingReason = null;
            candidate.ProcessingUntil = now.AddMinutes(5);
            candidate.Attempts++;
            await db.SaveChangesAsync(token);
            var organization = await db.BillingOrganizations.SingleAsync(x => x.Id == candidate.ReferrerOrganizationId
                && x.Environment == candidate.Environment, token);
            return new ReferralRewardClaim(candidate.Id, organization.Id, organization.CustomerId,
                organization.SubscriptionId, candidate.EventId, candidate.Days,
                candidate.TargetFreeThrough, candidate.RewardBasePeriodEnd);
        }, ct);
        if (claim is null) return;

        try
        {
            var pendingReason = "subscription-not-eligible";
            DateTimeOffset? freeThrough = null;
            DateTimeOffset? pendingRetryAt = null;
            if (claim.CustomerId is not null && claim.SubscriptionId is not null)
            {
                var subscription = await gateway.GetAsync($"/v1/subscriptions/{claim.SubscriptionId}", ct);
                var status = StripeBillingGateway.Text(subscription, "status");
                var schedule = StripeBillingGateway.Text(subscription, "schedule");
                var cancelAtPeriodEnd = subscription.TryGetProperty("cancel_at_period_end", out var cancel)
                    && cancel.ValueKind == System.Text.Json.JsonValueKind.True;
                var periodEnd = SubscriptionPeriodEnd(subscription);
                var trialEnd = StripeBillingGateway.Timestamp(subscription, "trial_end");
                if (StripeBillingGateway.Text(subscription, "customer") == claim.CustomerId
                    && status == "active" && !cancelAtPeriodEnd && schedule is null && periodEnd is { } paidThrough)
                {
                    var appliedEnd = await db.BillingReferralRewards.AsNoTracking()
                        .Where(x => x.ReferrerOrganizationId == claim.ReferrerOrganizationId && x.Status == "applied")
                        .Select(x => x.FreeThrough).MaxAsync(ct);
                    var rewardBasePeriodEnd = claim.RewardBasePeriodEnd ?? await db.BillingReferralRewards.AsNoTracking()
                        .Where(x => x.ReferrerOrganizationId == claim.ReferrerOrganizationId && x.Status == "applied"
                            && x.FreeThrough > clock.UtcNow && x.RewardBasePeriodEnd != null)
                        .OrderBy(x => x.AppliedAt).Select(x => x.RewardBasePeriodEnd).FirstOrDefaultAsync(ct) ?? paidThrough;
                    var schedulePlan = BillingReferralRewardPolicy.Calculate(clock.UtcNow, paidThrough,
                        trialEnd, appliedEnd, rewardBasePeriodEnd, claim.Days);
                    pendingRetryAt = schedulePlan.RetryAt;
                    var proposedEnd = claim.TargetFreeThrough ?? schedulePlan.ProposedFreeThrough;
                    freeThrough = claim.TargetFreeThrough is null ? schedulePlan.ProposedFreeThrough.AddDays(-claim.Days)
                        : appliedEnd ?? paidThrough;
                    if (claim.TargetFreeThrough is null && schedulePlan.IsCapped)
                    {
                        pendingReason = "reward-cap";
                    }
                    else if (claim.TargetFreeThrough is { } persistedTarget && persistedTarget <= clock.UtcNow
                        && (trialEnd is null || trialEnd < persistedTarget))
                    {
                        pendingReason = "reward-target-expired";
                    }
                    else
                    {
                        if (claim.TargetFreeThrough is null)
                        {
                            await data.ExecuteInTransactionAsync(async token =>
                            {
                                var reward = await db.BillingReferralRewards.SingleAsync(x => x.Id == claim.Id, token);
                                reward.TargetFreeThrough = proposedEnd;
                                reward.RewardBasePeriodEnd = rewardBasePeriodEnd;
                                await db.SaveChangesAsync(token);
                                return true;
                            }, ct);
                        }
                        if (trialEnd is null || trialEnd < proposedEnd)
                            await gateway.PostAsync($"/v1/subscriptions/{claim.SubscriptionId}", new()
                            {
                                ["trial_end"] = proposedEnd.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture),
                                ["proration_behavior"] = "none"
                            }, $"referral-reward-{claim.Id:N}", ct);
                        var verified = await gateway.GetAsync($"/v1/subscriptions/{claim.SubscriptionId}", ct);
                        freeThrough = StripeBillingGateway.Timestamp(verified, "trial_end");
                        if (StripeBillingGateway.Text(verified, "customer") != claim.CustomerId
                            || StripeBillingGateway.Text(verified, "status") != "active"
                            || freeThrough is null || freeThrough < proposedEnd)
                            throw new ConflictException("billing-referral-renewal-not-confirmed");
                        pendingReason = "";
                    }
                }
                else if (schedule is not null) pendingReason = "subscription-schedule-present";
                else if (cancelAtPeriodEnd) pendingReason = "subscription-cancels-at-period-end";
            }

            await data.ExecuteInTransactionAsync(async token =>
            {
                await LockAsync(claim.ReferrerOrganizationId, token);
                var reward = await db.BillingReferralRewards.SingleAsync(x => x.Id == claim.Id, token);
                reward.Status = pendingReason.Length == 0 ? "applied" : "pending";
                reward.PendingReason = pendingReason.Length == 0 ? null : pendingReason;
                reward.ProcessingUntil = null;
                reward.FreeThrough = freeThrough;
                reward.AppliedAt = pendingReason.Length == 0 ? clock.UtcNow : null;
                reward.NextAttemptAt = pendingReason switch
                {
                    "reward-cap" when pendingRetryAt is { } retry => retry,
                    "reward-target-expired" => DateTimeOffset.MaxValue,
                    "subscription-not-eligible" or "subscription-schedule-present" or "subscription-cancels-at-period-end" => clock.UtcNow.AddHours(6),
                    _ => clock.UtcNow
                };
                if (reward.NextAttemptAt < clock.UtcNow) reward.NextAttemptAt = clock.UtcNow;
                await db.SaveChangesAsync(token);
                if (pendingReason.Length == 0)
                {
                    var organization = await db.BillingOrganizations.SingleAsync(x => x.Id == claim.ReferrerOrganizationId, token);
                    await ReconcileAsync(organization, token);
                    Audit(organization.Id, null, "referral-reward-applied");
                    await db.SaveChangesAsync(token);
                }
                return true;
            }, ct);
        }
        catch
        {
            await data.ExecuteInTransactionAsync(async token =>
            {
                var reward = await db.BillingReferralRewards.SingleOrDefaultAsync(x => x.Id == claim.Id, token);
                if (reward is null || reward.Status != "processing") return true;
                reward.Status = "pending";
                reward.PendingReason = "provider-update-pending";
                reward.ProcessingUntil = null;
                reward.NextAttemptAt = clock.UtcNow.AddMinutes(Math.Min(360, Math.Pow(2, reward.Attempts)));
                await db.SaveChangesAsync(token);
                return true;
            }, ct);
            throw;
        }
    }

    public Task<BillingReferralSummary> GetReferralAsync(Guid userId, Guid organizationId, CancellationToken ct)
        => data.ExecuteAsUserAsync(userId, async token =>
        {
            await LockAsync(organizationId, token);
            var organization = await RequireReferralOwnerAsync(userId, organizationId, token);
            var code = await db.BillingReferralCodes.SingleOrDefaultAsync(x => x.OrganizationId == organizationId
                && x.Environment == gateway.Environment, token);
            if (code is null)
            {
                code = new BillingReferralCode
                {
                    OrganizationId = organizationId,
                    Environment = gateway.Environment,
                    Code = RandomNumberGenerator.GetString(ReferralCodeAlphabet, 15),
                    CreatedAt = clock.UtcNow
                };
                db.BillingReferralCodes.Add(code);
                await db.SaveChangesAsync(token);
            }
            return await ReferralSummaryAsync(organization, code.Code, token);
        }, ct);

    public Task<BillingReferralSummary> AttributeReferralAsync(Guid userId, Guid organizationId,
        string referralCode, CancellationToken ct) => data.ExecuteAsUserAsync(userId, async token =>
    {
        var normalizedCode = NormalizeReferralCode(referralCode);
        if (normalizedCode is null)
            throw new ValidationException("billing-referral-code-invalid");
        await LockAsync(organizationId, token);
        var referred = await RequireReferralOwnerAsync(userId, organizationId, token);
        if (await db.BillingReferralAttributions.AnyAsync(x => x.ReferredOrganizationId == organizationId, token))
            throw new ConflictException("billing-referral-already-attributed");
        if (await db.BillingFinancialEvents.AnyAsync(x => x.OrganizationId == organizationId
            && x.EventType == "invoice.paid" && x.AmountMinor > 0 && x.SubscriptionId != null, token))
            throw new ConflictException("billing-referral-after-first-payment");
        if (referred.CustomerId is { } customerId)
        {
            if (!gateway.IsConfigured)
                throw new ConflictException("billing-referral-payment-history-unavailable");
            if (await FindFirstPositivePaidSubscriptionInvoiceAsync(customerId, token) is not null)
                throw new ConflictException("billing-referral-after-first-payment");
        }
        var legacyCode = normalizedCode.ToLowerInvariant();
        var code = await db.BillingReferralCodes.SingleOrDefaultAsync(x =>
            (x.Code == normalizedCode || x.Code == legacyCode)
            && x.Environment == gateway.Environment, token)
            ?? throw new ValidationException("billing-referral-code-invalid");
        var referrer = await db.BillingOrganizations.SingleOrDefaultAsync(x => x.Id == code.OrganizationId
            && x.Environment == gateway.Environment, token)
            ?? throw new ValidationException("billing-referral-code-invalid");
        if (referrer.Id == referred.Id || referrer.OwnerUserId == userId)
            throw new ValidationException("billing-referral-self-referral");
        db.BillingReferralAttributions.Add(new BillingReferralAttribution
        {
            ReferredOrganizationId = organizationId,
            ReferrerOrganizationId = referrer.Id,
            Code = code.Code,
            CreatedAt = clock.UtcNow
        });
        await db.SaveChangesAsync(token);
        var ownCode = await db.BillingReferralCodes.AsNoTracking().Where(x => x.OrganizationId == referred.Id
            && x.Environment == gateway.Environment).Select(x => x.Code).SingleOrDefaultAsync(token) ?? "";
        var summary = await ReferralSummaryAsync(referred, ownCode, token);
        return summary with { AttributedToCode = FormatReferralCode(code.Code) };
    }, ct);

    private async Task<FirstPaidInvoice?> FindFirstPositivePaidSubscriptionInvoiceAsync(string customerId,
        CancellationToken ct)
    {
        var path = $"/v1/invoices?customer={Uri.EscapeDataString(customerId)}&status=paid&limit=100";
        FirstPaidInvoice? first = null;
        // shortcut: inspect at most 10,000 invoices; add indexed reconciliation before supporting higher-volume accounts.
        for (var page = 0; page < 100; page++)
        {
            var result = await gateway.GetAsync(path, ct);
            var invoices = result.GetProperty("data").EnumerateArray().ToArray();
            foreach (var invoice in invoices)
            {
                if (Number(invoice, "amount_paid") is not { } amount || amount <= 0
                    || InvoiceSubscriptionId(invoice) is null) continue;
                if (!invoice.TryGetProperty("status_transitions", out var transitions)
                    || StripeBillingGateway.Timestamp(transitions, "paid_at") is not { } paidAt)
                    throw new ConflictException("billing-referral-payment-history-incomplete");
                var invoiceId = StripeBillingGateway.Text(invoice, "id")
                    ?? throw new ConflictException("billing-referral-payment-history-incomplete");
                if (first is null || paidAt < first.PaidAt
                    || paidAt == first.PaidAt && string.CompareOrdinal(invoiceId, first.InvoiceId) < 0)
                    first = new(invoiceId, paidAt);
            }

            if (!result.GetProperty("has_more").GetBoolean()) return first;
            if (page == 99 || invoices.Length == 0)
                throw new ConflictException("billing-referral-payment-history-too-large");
            var cursor = StripeBillingGateway.Text(invoices[^1], "id")
                ?? throw new ConflictException("billing-referral-payment-history-incomplete");
            path = $"/v1/invoices?customer={Uri.EscapeDataString(customerId)}&status=paid&limit=100&starting_after={Uri.EscapeDataString(cursor)}";
        }

        throw new ConflictException("billing-referral-payment-history-too-large");
    }

    private async Task<BillingOrganization> RequireReferralOwnerAsync(Guid userId, Guid organizationId,
        CancellationToken ct)
        => await db.BillingOrganizations.SingleOrDefaultAsync(x => x.Id == organizationId
            && x.OwnerUserId == userId && x.Environment == gateway.Environment, ct)
            ?? throw new NotFoundException("Billing account not found.");

    private async Task<BillingReferralSummary> ReferralSummaryAsync(BillingOrganization organization,
        string code, CancellationToken ct)
    {
        var referrals = await db.BillingReferralAttributions.Where(x => x.ReferrerOrganizationId == organization.Id)
            .Select(x => x.ReferredOrganizationId).ToListAsync(ct);
        var rewards = await db.BillingReferralRewards.Where(x => x.ReferrerOrganizationId == organization.Id).ToListAsync(ct);
        var attributedToCode = await db.BillingReferralAttributions.Where(x => x.ReferredOrganizationId == organization.Id)
            .Select(x => x.Code).SingleOrDefaultAsync(ct);
        return new BillingReferralSummary(FormatReferralCode(code),
            attributedToCode is null ? null : FormatReferralCode(attributedToCode), referrals.Count,
            rewards.Where(x => x.Status == "applied").Sum(x => x.Days),
            rewards.Where(x => x.Status == "pending").Sum(x => x.Days));
    }

    private static string? NormalizeReferralCode(string value)
    {
        var normalized = string.Concat(value.Where(x => x != '-' && !char.IsWhiteSpace(x))).ToUpperInvariant();
        if (normalized.Length == 15 && normalized.All(x => ReferralCodeAlphabet.Contains(x))) return normalized;
        if (normalized.Length is >= 16 and <= 32 && normalized.All(Uri.IsHexDigit)) return normalized;
        return null;
    }

    private static string FormatReferralCode(string code)
    {
        code = code.ToUpperInvariant();
        var groupSize = code.Length == 15 ? 3 : 4;
        return string.Join('-', Enumerable.Range(0, (code.Length + groupSize - 1) / groupSize)
            .Select(index => code.Substring(index * groupSize, Math.Min(groupSize, code.Length - index * groupSize))));
    }

    private static DateTimeOffset? SubscriptionPeriodEnd(System.Text.Json.JsonElement subscription)
    {
        if (subscription.TryGetProperty("items", out var items) && items.TryGetProperty("data", out var dataItems))
        {
            var ends = dataItems.EnumerateArray().Select(x => StripeBillingGateway.Timestamp(x, "current_period_end"))
                .Where(x => x is not null).Select(x => x!.Value).ToArray();
            if (ends.Length > 0) return ends.Max();
        }
        return StripeBillingGateway.Timestamp(subscription, "current_period_end");
    }

    private sealed record ReferralRewardClaim(Guid Id, Guid ReferrerOrganizationId, string? CustomerId,
        string? SubscriptionId, string EventId, int Days, DateTimeOffset? TargetFreeThrough,
        DateTimeOffset? RewardBasePeriodEnd);
    private sealed record FirstPaidInvoice(string InvoiceId, DateTimeOffset PaidAt);
}
