using Microsoft.EntityFrameworkCore;
using Sonivo.Application.Billing;
using Sonivo.Domain.Billing;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Persistence;
using Sonivo.Application.Abstractions;

namespace Sonivo.Infrastructure.Payments;

public sealed class BillingProjection(SonivoDbContext db, IClock clock, StripeBillingGateway gateway) : IBillingPolicy
{
    public async Task ProjectAsync(Group group, CancellationToken ct)
    {
        var link = await db.BillingGroups.SingleOrDefaultAsync(x => x.GroupId == group.Id, ct);
        if (link is null)
        {
            group.ProjectBilling(PlanCatalog.Starter, "inactive", null, null, true);
            return;
        }
        var organization = await db.BillingOrganizations.SingleAsync(x => x.Id == link.OrganizationId, ct);
        var grant = await ActiveGrantAsync(db, organization.Id, clock.UtcNow, ct);
        Apply(group, link, organization, clock.UtcNow, grant);
    }

    public async Task InitializeAsync(Group group, Guid ownerUserId, CancellationToken ct)
    {
        var candidates = await db.BillingOrganizations
            .Where(x => x.OwnerUserId == ownerUserId && x.Environment == gateway.Environment)
            .OrderBy(x => x.CreatedAt).ToListAsync(ct);
        BillingOrganization? organization = null;
        var capacityReached = false;
        foreach (var candidate in candidates)
        {
            var grant = await ActiveGrantAsync(db, candidate.Id, clock.UtcNow, ct);
            if (grant is null && !candidate.CanCreate(clock.UtcNow)) continue;
            var capacity = grant is null ? candidate.GroupCapacity(clock.UtcNow)
                : PlanCatalog.Get(grant.PlanId).Limits.Groups ?? int.MaxValue;
            if (await db.BillingGroups.CountAsync(x => x.OrganizationId == candidate.Id, ct) >= capacity)
            {
                capacityReached = true;
                continue;
            }
            organization = candidate;
            break;
        }
        if (organization is null)
            throw new ConflictException(capacityReached ? "billing-group-limit" : "billing-active-plan-required");
        if (organization.PrimaryGroupId is null) organization.AssignPrimaryGroup(group.Id, clock.UtcNow);
        db.BillingGroups.Add(new() { GroupId = group.Id, OrganizationId = organization.Id });
        var activeGrant = await ActiveGrantAsync(db, organization.Id, clock.UtcNow, ct);
        group.ProjectBilling(activeGrant?.PlanId ?? organization.EffectivePlan(clock.UtcNow),
            activeGrant is null ? organization.Status : "temporary_grant", organization.TrialEndsAt,
            organization.ScheduledPlanId, activeGrant is null && !organization.CanCreate(clock.UtcNow));
    }

    internal static Task<BillingAccessGrant?> ActiveGrantAsync(SonivoDbContext db, Guid organizationId,
        DateTimeOffset now, CancellationToken ct)
        => db.BillingAccessGrants.Where(x => x.OrganizationId == organizationId && x.RevokedAt == null
                && x.StartsAt <= now && now < x.ExpiresAt)
            .OrderByDescending(x => x.ExpiresAt).FirstOrDefaultAsync(ct);

    internal static void Apply(Group group, BillingGroup link, BillingOrganization organization, DateTimeOffset now,
        BillingAccessGrant? grant = null)
    {
        var legacy = link.LegacyPlanId is not null && organization.SubscriptionId is null && organization.TrialEndsAt is null;
        var effectivePlan = grant?.PlanId ?? (legacy ? link.LegacyPlanId! : organization.EffectivePlan(now));
        var capacity = PlanCatalog.Get(effectivePlan).Limits.Groups ?? int.MaxValue;
        var included = group.Id == organization.PrimaryGroupId || grant is not null
            || organization.SubscriptionId is not null && (capacity > 1 || organization.ExtraGroups > 0);
        var readOnly = !legacy && grant is null && (HasExpired(organization, now) || organization.Status == "inactive");
        var plan = grant?.PlanId ?? (legacy ? link.LegacyPlanId! : included ? organization.EffectivePlan(now) : PlanCatalog.Starter);
        var status = grant is not null ? "temporary_grant" : legacy ? "legacy" : readOnly ? BillingStatuses.ReadOnly : organization.Status;
        group.ProjectBilling(plan, status,
            organization.TrialEndsAt, organization.ScheduledPlanId,
            grant is null && !legacy && (!included || !organization.CanCreate(now)));
    }

    private static bool HasExpired(BillingOrganization organization, DateTimeOffset now)
    {
        if (organization.TrialEndsAt is { } trialEnd && trialEnd <= now) return true;
        if (organization.Status == BillingStatuses.PastDue)
            return organization.PastDueSince is { } due && due.AddDays(7) <= now;
        if (organization.Status == BillingStatuses.Active)
            return organization.PeriodEndsAt is not { } end || end <= now;
        return organization.SubscriptionId is not null
            && organization.Status is "canceled" or "unpaid" or "incomplete_expired" or "paused";
    }

}
