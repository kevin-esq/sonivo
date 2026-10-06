using Sonivo.Domain.Billing;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class PlanCatalogTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-05T12:00:00Z");

    [Fact]
    public void Catalog_exposes_the_three_plans()
    {
        Assert.Equal(3, PlanCatalog.Plans.Count);
        Assert.True(PlanCatalog.IsKnown(PlanCatalog.Starter));
        Assert.True(PlanCatalog.IsKnown(PlanCatalog.Pro));
        Assert.True(PlanCatalog.IsKnown(PlanCatalog.Studio));
        Assert.False(PlanCatalog.IsKnown("nope"));
        Assert.False(PlanCatalog.IsKnown(null));
    }

    [Theory]
    [InlineData(PlanCatalog.Starter, BrandingLevel.None, false, false, false)]
    [InlineData(PlanCatalog.Pro, BrandingLevel.Basic, true, false, false)]
    [InlineData(PlanCatalog.Studio, BrandingLevel.Advanced, true, true, true)]
    public void Branding_capabilities_are_derived_from_the_level(
        string planId, BrandingLevel level, bool accent, bool splitColors, bool removePoweredBy)
    {
        var plan = PlanCatalog.Get(planId);
        var caps = PlanCatalog.BrandingCapabilitiesFor(planId);

        Assert.Equal(level, plan.Features.Branding);
        Assert.Equal(accent, caps.Accent);
        Assert.Equal(splitColors, caps.SplitColors);
        Assert.Equal(removePoweredBy, caps.RemovePoweredBy);
    }

    [Fact]
    public void Unknown_plan_falls_back_to_the_default()
    {
        Assert.Equal(PlanCatalog.DefaultPlanId, PlanCatalog.Get("nope").Id);
        Assert.Equal(
            PlanCatalog.BrandingCapabilitiesFor(PlanCatalog.DefaultPlanId),
            PlanCatalog.BrandingCapabilitiesFor("nope"));
    }

    [Fact]
    public void Group_defaults_to_the_default_plan_and_assigns_known_plans_only()
    {
        var group = Group.Create("Band", Now);
        Assert.Equal(PlanCatalog.DefaultPlanId, group.PlanId);

        group.AssignPlan(PlanCatalog.Starter, Now);
        Assert.Equal(PlanCatalog.Starter, group.PlanId);

        Assert.Throws<ArgumentException>(() => group.AssignPlan("nope", Now));
    }
}
