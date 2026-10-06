using Sonivo.Application.Abstractions;
using Sonivo.Application.Billing;

namespace Sonivo.Application.Tests;

public class PlanLimitGuardTests
{
    [Fact]
    public void Starter_blocks_creation_at_the_song_limit()
    {
        Assert.Equal(50, PlanLimitGuard.LimitFor("starter", PlanMetric.Songs));

        PlanLimitGuard.EnsureWithinLimit("starter", PlanMetric.Songs, 49);

        var ex = Assert.Throws<PlanLimitException>(() =>
            PlanLimitGuard.EnsureWithinLimit("starter", PlanMetric.Songs, 50));
        Assert.Equal("Songs", ex.Metric);
        Assert.Equal(50, ex.Limit);
    }

    [Fact]
    public void Starter_limits_members_setlists_and_events()
    {
        Assert.Equal(3, PlanLimitGuard.LimitFor("starter", PlanMetric.Members));
        Assert.Equal(5, PlanLimitGuard.LimitFor("starter", PlanMetric.Setlists));
        Assert.Equal(10, PlanLimitGuard.LimitFor("starter", PlanMetric.EventsPerMonth));
    }

    [Fact]
    public void Studio_has_no_countable_limits()
    {
        Assert.Null(PlanLimitGuard.LimitFor("studio", PlanMetric.Songs));
        Assert.Null(PlanLimitGuard.LimitFor("studio", PlanMetric.Setlists));
        Assert.Null(PlanLimitGuard.LimitFor("studio", PlanMetric.EventsPerMonth));
        Assert.Null(PlanLimitGuard.LimitFor("studio", PlanMetric.Members));

        // Never throws when unlimited, regardless of count.
        PlanLimitGuard.EnsureWithinLimit("studio", PlanMetric.Songs, 1_000_000);
    }
}
