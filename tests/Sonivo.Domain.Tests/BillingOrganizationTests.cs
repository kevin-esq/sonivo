using Sonivo.Domain.Billing;

namespace Sonivo.Domain.Tests;

public sealed class BillingOrganizationTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-03T12:00:00Z");

    [Fact]
    public void Unpaid_organization_has_no_creation_or_premium_access()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        Assert.False(organization.CanCreate(Now));
        Assert.Equal(PlanCatalog.Starter, organization.EffectivePlan(Now));
    }

    [Fact]
    public void Past_due_grace_does_not_restart_when_provider_repeats_state()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "active", Now.AddMonths(1), null, false, 0, Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "past_due", Now.AddMonths(1), null, false, 0, Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "past_due", Now.AddMonths(1), null, false, 0, Now.AddDays(6));
        Assert.True(organization.CanCreate(Now.AddDays(6)));
        Assert.False(organization.CanCreate(Now.AddDays(7)));
        Assert.Equal(PlanCatalog.Starter, organization.EffectivePlan(Now.AddDays(7)));
    }

    [Fact]
    public void Trial_uses_authoritative_end_and_cannot_be_extended_by_replay()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.StartTrial(PlanCatalog.Pro, Now.AddDays(14), Now);
        Assert.True(organization.CanCreate(Now.AddDays(13)));
        Assert.False(organization.CanCreate(Now.AddDays(14)));
        Assert.Throws<InvalidOperationException>(() => organization.StartTrial(PlanCatalog.Pro, Now.AddDays(30), Now));
    }

    [Fact]
    public void Retention_deadline_starts_when_trial_access_ends()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.StartTrial(PlanCatalog.Pro, Now.AddDays(14), Now);

        Assert.Null(organization.RetentionEndsAt(Now.AddDays(13)));
        Assert.Equal(Now.AddDays(104), organization.RetentionEndsAt(Now.AddDays(14)));
    }

    [Fact]
    public void Retention_deadline_starts_after_past_due_grace()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "past_due", Now.AddMonths(1), null, false, 0, Now);

        Assert.Null(organization.RetentionEndsAt(Now.AddDays(6)));
        Assert.Equal(Now.AddDays(97), organization.RetentionEndsAt(Now.AddDays(7)));
    }

    [Fact]
    public void Retention_deadline_is_ninety_days_after_paid_period_end()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "active", Now.AddDays(30), null, false, 0, Now);

        Assert.Equal(Now.AddDays(120), organization.RetentionEndsAt(Now.AddDays(30)));
    }

    [Fact]
    public void Retention_deadline_includes_the_latest_non_revoked_access_grant()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.StartTrial(PlanCatalog.Pro, Now.AddDays(14), Now);

        Assert.Equal(Now.AddDays(120), organization.RetentionEndsAt(Now.AddDays(14), Now.AddDays(30)));
        Assert.Equal(Now.AddDays(104), organization.RetentionEndsAt(Now.AddDays(14)));
    }

    [Fact]
    public void Old_trial_and_access_grant_do_not_expire_an_active_subscription()
    {
        var createdAt = Now.AddDays(-200);
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), createdAt);
        organization.StartTrial(PlanCatalog.Pro, createdAt.AddDays(14), createdAt);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "active", Now.AddDays(30), null,
            false, 0, Now.AddDays(-1));

        Assert.Null(organization.RetentionEndsAt(Now, Now.AddDays(-120)));
    }

    [Fact]
    public void Retention_never_purges_active_subscription_with_missing_period_end()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "active", null, null, false, 0, Now);

        Assert.Null(organization.RetentionEndsAt(Now.AddYears(1)));
    }

    [Fact]
    public void Scheduled_cancellation_retains_data_until_paid_period_ends()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "canceled", Now.AddDays(30), null, true, 0, Now);

        Assert.Null(organization.RetentionEndsAt(Now.AddDays(29)));
        Assert.Equal(Now.AddDays(120), organization.RetentionEndsAt(Now.AddDays(30)));
    }

    [Theory]
    [InlineData(PlanCatalog.Starter)]
    [InlineData(PlanCatalog.Studio)]
    public void Trial_is_only_available_for_band(string planId)
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        Assert.Throws<ArgumentException>(() => organization.StartTrial(planId, Now.AddDays(14), Now));
    }

    [Fact]
    public void Unknown_provider_plan_cannot_grant_studio()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        Assert.Throws<ArgumentException>(() => organization.ApplySubscription("sub_1", "unknown", "month", "active", Now.AddMonths(1), null, false, 0, Now));
        Assert.False(organization.CanCreate(Now));
    }

    [Fact]
    public void Canceled_subscription_cannot_create_even_with_future_period_end()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Studio, "month", "canceled", Now.AddMonths(1), null, false, 0, Now);
        Assert.False(organization.CanCreate(Now));
    }

    [Fact]
    public void Canceled_subscription_can_be_replaced_only_after_new_provider_subscription_is_verified()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_old", PlanCatalog.Pro, "month", "active", Now.AddMonths(1), null, false, 0, Now);
        Assert.Throws<InvalidOperationException>(() => organization.ApplySubscription("sub_new", PlanCatalog.Pro, "month", "active", Now.AddMonths(2), null, false, 0, Now));
        organization.ApplySubscription("sub_old", PlanCatalog.Pro, "month", "canceled", Now, null, false, 0, Now);
        organization.ApplySubscription("sub_new", PlanCatalog.Studio, "month", "active", Now.AddMonths(1), null, false, 0, Now);
        Assert.Equal("sub_new", organization.SubscriptionId);
    }

    [Fact]
    public void Repeated_provider_state_does_not_invalidate_quote_version()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "active", Now.AddMonths(1), null, false, 0, Now);
        var version = organization.Version;
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "active", Now.AddMonths(1), null, false, 0, Now.AddHours(1));
        Assert.Equal(version, organization.Version);
    }

    [Fact]
    public void Financial_review_blocks_new_creation_without_removing_history()
    {
        var organization = BillingOrganization.Create(Guid.NewGuid(), Guid.NewGuid(), Now);
        organization.ApplySubscription("sub_1", PlanCatalog.Pro, "month", "active", Now.AddMonths(1), null, false, 0, Now);
        organization.SuspendForReview(Now.AddHours(1));
        Assert.False(organization.CanCreate(Now.AddHours(1)));
        Assert.Equal("sub_1", organization.SubscriptionId);
    }

    [Theory]
    [InlineData("starter", "month", 9900)]
    [InlineData("pro", "month", 19900)]
    [InlineData("studio", "month", 49900)]
    public void Approved_prices_are_integer_minor_units(string plan, string interval, long expected)
        => Assert.Equal(expected, BillingPrices.Amount(plan, interval));

    [Fact]
    public void Annual_prices_and_extra_group_addons_are_not_available()
    {
        Assert.Throws<ArgumentException>(() => BillingPrices.Amount(PlanCatalog.Pro, "year"));
        Assert.Throws<ArgumentException>(() => BillingOrganization.ValidatePlan(PlanCatalog.Studio, "month", 1));
    }
}
