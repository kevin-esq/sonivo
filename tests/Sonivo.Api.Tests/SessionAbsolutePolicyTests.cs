using Sonivo.Api.Auth;

namespace Sonivo.Api.Tests;

public class SessionAbsolutePolicyTests
{
    private static readonly DateTimeOffset Issued = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Before_30_days_is_not_expired()
    {
        Assert.False(SessionAbsolutePolicy.IsExpired(Issued, Issued.AddDays(29)));
    }

    [Fact]
    public void Exactly_30_days_is_not_expired()
    {
        Assert.False(SessionAbsolutePolicy.IsExpired(Issued, Issued.AddDays(30)));
    }

    [Fact]
    public void After_30_days_is_expired()
    {
        Assert.True(SessionAbsolutePolicy.IsExpired(Issued, Issued.AddDays(30).AddTicks(1)));
    }
}
