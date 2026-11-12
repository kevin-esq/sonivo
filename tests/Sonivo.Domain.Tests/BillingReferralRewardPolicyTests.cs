using Sonivo.Domain.Billing;

namespace Sonivo.Domain.Tests;

public sealed class BillingReferralRewardPolicyTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-05T12:00:00Z");

    [Fact]
    public void First_reward_adds_thirty_days_after_paid_period_without_consuming_cap_on_paid_time()
    {
        var paidThrough = Now.AddDays(30);

        var plan = BillingReferralRewardPolicy.Calculate(Now, paidThrough, null, null, null, 30);

        Assert.Equal(paidThrough.AddDays(30), plan.ProposedFreeThrough);
        Assert.Equal(paidThrough, plan.RewardBasePeriodEnd);
        Assert.False(plan.IsCapped);
    }

    [Fact]
    public void Twelve_month_cap_allows_exactly_360_future_reward_days()
    {
        var plan = BillingReferralRewardPolicy.Calculate(Now, Now, null, Now.AddDays(330), Now, 30);

        Assert.False(plan.IsCapped);
        Assert.Equal(Now.AddDays(360), plan.ProposedFreeThrough);
    }

    [Fact]
    public void Reward_over_cap_waits_until_thirty_days_of_the_free_window_are_consumed()
    {
        var plan = BillingReferralRewardPolicy.Calculate(Now, Now, null, Now.AddDays(360), Now, 30);

        Assert.True(plan.IsCapped);
        Assert.Equal(Now.AddDays(390), plan.ProposedFreeThrough);
        Assert.Equal(Now.AddDays(30), plan.RetryAt);
    }
}
