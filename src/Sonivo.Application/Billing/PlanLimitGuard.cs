using Sonivo.Application.Abstractions;
using Sonivo.Domain.Billing;

namespace Sonivo.Application.Billing;

/// <summary>The countable metrics a plan limits (PHASE-PLANS-SPEC §6.1).</summary>
public enum PlanMetric
{
    Members,
    Songs,
    Setlists,
    EventsPerMonth
}

/// <summary>
/// Server-authoritative plan-limit enforcement (ADR-0071, PHASE-PLANS-SPEC §4.1).
/// Creation is blocked at the limit; viewing/editing/deleting existing content is
/// never blocked. The client mirrors the same limits for UX (validation symmetry).
/// </summary>
public static class PlanLimitGuard
{
    public static long? LimitFor(string planId, PlanMetric metric) => metric switch
    {
        PlanMetric.Members => PlanCatalog.Get(planId).Limits.Members,
        PlanMetric.Songs => PlanCatalog.Get(planId).Limits.Songs,
        PlanMetric.Setlists => PlanCatalog.Get(planId).Limits.Setlists,
        PlanMetric.EventsPerMonth => PlanCatalog.Get(planId).Limits.EventsPerMonth,
        _ => null
    };

    /// <summary>Throws <see cref="PlanLimitException"/> when <paramref name="currentCount"/> is at/over the limit.</summary>
    public static void EnsureWithinLimit(string planId, PlanMetric metric, long currentCount)
    {
        var limit = LimitFor(planId, metric);
        if (limit is not null && currentCount >= limit)
        {
            throw new PlanLimitException(metric.ToString(), limit.Value);
        }
    }
}
