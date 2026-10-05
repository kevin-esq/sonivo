using Sonivo.Api.Session;

namespace Sonivo.Api.Tests.SessionHandoff;

public class SessionHandoffServiceTests
{
    private static readonly DateTimeOffset Start = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private sealed class MutableTimeProvider : TimeProvider
    {
        private DateTimeOffset _now;

        public MutableTimeProvider(DateTimeOffset now) => _now = now;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan delta) => _now = _now.Add(delta);
    }

    private static SessionHandoffService CreateService(TimeProvider clock) =>
        new(new InMemorySessionHandoffStore(clock), clock);

    [Fact]
    public void Create_issues_a_256_bit_opaque_code()
    {
        var service = CreateService(new MutableTimeProvider(Start));

        var created = service.Create(Guid.NewGuid(), Guid.NewGuid(), "coro", "UA");

        // 32 bytes Base64Url-encoded = 43 characters, no padding.
        Assert.Equal(43, created.Code.Length);
        Assert.DoesNotContain('=', created.Code);
        Assert.Equal(Start.AddSeconds(90), created.ExpiresAt);
    }

    [Fact]
    public void Consume_once_succeeds_then_returns_null()
    {
        var service = CreateService(new MutableTimeProvider(Start));
        var created = service.Create(Guid.NewGuid(), Guid.NewGuid(), "coro", "UA");

        var ticket = service.Consume(created.Code, "UA");

        Assert.NotNull(ticket);
        Assert.Null(service.Consume(created.Code, "UA"));
    }

    [Fact]
    public void Consume_returns_null_after_expiry()
    {
        var clock = new MutableTimeProvider(Start);
        var service = CreateService(clock);
        var created = service.Create(Guid.NewGuid(), Guid.NewGuid(), "coro", "UA");

        clock.Advance(TimeSpan.FromSeconds(91));

        Assert.Null(service.Consume(created.Code, "UA"));
    }

    [Fact]
    public void Consume_at_exact_expiry_returns_null()
    {
        var clock = new MutableTimeProvider(Start);
        var service = CreateService(clock);
        var created = service.Create(Guid.NewGuid(), Guid.NewGuid(), "coro", "UA");

        clock.Advance(TimeSpan.FromSeconds(90));

        Assert.Null(service.Consume(created.Code, "UA"));
    }

    [Fact]
    public void Consume_with_different_user_agent_returns_null()
    {
        var service = CreateService(new MutableTimeProvider(Start));
        var created = service.Create(Guid.NewGuid(), Guid.NewGuid(), "coro", "UA-A");

        Assert.Null(service.Consume(created.Code, "UA-B"));
    }

    [Fact]
    public void Consume_with_matching_user_agent_succeeds()
    {
        var service = CreateService(new MutableTimeProvider(Start));
        var created = service.Create(Guid.NewGuid(), Guid.NewGuid(), "coro", "UA-A");

        Assert.NotNull(service.Consume(created.Code, "UA-A"));
    }

    [Fact]
    public void Distinct_codes_are_independent()
    {
        var service = CreateService(new MutableTimeProvider(Start));
        var first = service.Create(Guid.NewGuid(), Guid.NewGuid(), "coro", "UA");
        var second = service.Create(Guid.NewGuid(), Guid.NewGuid(), "coro", "UA");

        Assert.NotEqual(first.Code, second.Code);
        Assert.NotNull(service.Consume(first.Code, "UA"));
        Assert.NotNull(service.Consume(second.Code, "UA"));
    }

    [Fact]
    public void Consume_unknown_code_returns_null()
    {
        var service = CreateService(new MutableTimeProvider(Start));

        Assert.Null(service.Consume("not-a-real-code", "UA"));
    }

    [Fact]
    public void Consume_blank_code_returns_null()
    {
        var service = CreateService(new MutableTimeProvider(Start));

        Assert.Null(service.Consume(string.Empty, "UA"));
    }
}
