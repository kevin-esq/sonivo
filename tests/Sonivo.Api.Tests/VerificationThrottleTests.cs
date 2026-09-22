using Sonivo.Api.Auth;
using Sonivo.Application.Abstractions;

namespace Sonivo.Api.Tests;

public class VerificationThrottleTests
{
    private sealed class MutableClock : IClock
    {
        public DateTimeOffset UtcNow { get; set; } = DateTimeOffset.UtcNow;
    }

    [Fact]
    public void First_claim_for_email_is_allowed()
    {
        var throttle = new VerificationThrottle(new MutableClock());
        Assert.True(throttle.TryClaim("singer@example.com"));
    }

    [Fact]
    public void Second_claim_inside_cooldown_is_denied()
    {
        var clock = new MutableClock();
        var throttle = new VerificationThrottle(clock);
        Assert.True(throttle.TryClaim("singer@example.com"));

        clock.UtcNow = clock.UtcNow.AddSeconds(59);
        Assert.False(throttle.TryClaim("singer@example.com"));
    }

    [Fact]
    public void Claim_after_cooldown_is_allowed()
    {
        var clock = new MutableClock();
        var throttle = new VerificationThrottle(clock);
        Assert.True(throttle.TryClaim("singer@example.com"));

        clock.UtcNow = clock.UtcNow.AddSeconds(61);
        Assert.True(throttle.TryClaim("singer@example.com"));
    }

    [Fact]
    public void Cooldown_is_per_email_and_case_insensitive()
    {
        var throttle = new VerificationThrottle(new MutableClock());
        Assert.True(throttle.TryClaim("singer@example.com"));
        Assert.False(throttle.TryClaim("SINGER@example.com"));
        Assert.True(throttle.TryClaim("other@example.com"));
    }
}
