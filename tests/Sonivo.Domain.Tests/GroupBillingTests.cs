using Sonivo.Domain.Billing;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Domain.Tests;

public class GroupBillingTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-06T12:00:00Z");

    [Fact]
    public void StartTrial_sets_trialing_and_the_end_date()
    {
        var group = Group.Create("Band", Now);

        group.StartTrial(PlanCatalog.Pro, Now);

        Assert.Equal(PlanCatalog.Pro, group.PlanId);
        Assert.Equal(BillingStatuses.Trialing, group.BillingStatus);
        Assert.Equal(Now.AddDays(14), group.TrialEndsAt);
        Assert.Null(group.ScheduledPlanId);
    }

    [Fact]
    public void SchedulePlanChange_defers_until_applied()
    {
        var group = Group.Create("Band", Now);
        group.StartTrial(PlanCatalog.Studio, Now);

        group.SchedulePlanChange(PlanCatalog.Starter, Now);
        Assert.Equal(PlanCatalog.Studio, group.PlanId);
        Assert.Equal(PlanCatalog.Starter, group.ScheduledPlanId);

        group.ApplyScheduledPlan(Now.AddDays(15));
        Assert.Equal(PlanCatalog.Starter, group.PlanId);
        Assert.Null(group.ScheduledPlanId);
        Assert.Equal(BillingStatuses.Active, group.BillingStatus);
        Assert.Null(group.TrialEndsAt);
    }

    [Fact]
    public void Scheduling_the_current_plan_clears_the_schedule()
    {
        var group = Group.Create("Band", Now);
        group.AssignPlan(PlanCatalog.Pro, Now);

        group.SchedulePlanChange(PlanCatalog.Pro, Now);

        Assert.Null(group.ScheduledPlanId);
    }

    [Fact]
    public void AssignPlan_clears_billing_state_and_rejects_unknown()
    {
        var group = Group.Create("Band", Now);
        group.StartTrial(PlanCatalog.Pro, Now);

        group.AssignPlan(PlanCatalog.Studio, Now);

        Assert.Equal(BillingStatuses.Active, group.BillingStatus);
        Assert.Null(group.TrialEndsAt);
        Assert.Throws<ArgumentException>(() => group.AssignPlan("nope", Now));
        Assert.Throws<ArgumentException>(() => group.StartTrial("nope", Now));
    }

    [Fact]
    public void EnterReadOnly_marks_the_status()
    {
        var group = Group.Create("Band", Now);

        group.EnterReadOnly(Now);

        Assert.Equal(BillingStatuses.ReadOnly, group.BillingStatus);
    }
}
