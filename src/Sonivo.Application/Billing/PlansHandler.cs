using Sonivo.Domain.Billing;

namespace Sonivo.Application.Billing;

/// <summary>A plan as exposed to clients (ADR-0071).</summary>
public sealed record PlanDto(
    string Id,
    int PriceMonthlyMxn,
    int TrialDays,
    bool TrialRequiresCard,
    PlanLimits Limits,
    PlanFeatures Features,
    BrandingCapabilities Capabilities);

public sealed record PlanCatalogDto(string DefaultPlanId, IReadOnlyList<PlanDto> Plans);

/// <summary>
/// Returns the entitlements catalog (single source of truth). Read-only, no
/// authorization needed beyond being signed in at the API boundary.
/// </summary>
public sealed class GetPlanCatalogHandler
{
    public PlanCatalogDto Handle()
    {
        var plans = PlanCatalog.Plans.Values
            .OrderBy(plan => plan.PriceMonthlyMxn)
            .Select(plan => new PlanDto(
                plan.Id,
                plan.PriceMonthlyMxn,
                plan.TrialDays,
                plan.TrialRequiresCard,
                plan.Limits,
                plan.Features,
                plan.BrandingCapabilities))
            .ToList();

        return new PlanCatalogDto(PlanCatalog.DefaultPlanId, plans);
    }
}
