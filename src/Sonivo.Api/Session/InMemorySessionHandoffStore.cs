using System.Collections.Concurrent;

namespace Sonivo.Api.Session;

/// <summary>
/// Process-local, thread-safe handoff store. Suitable for the current single
/// instance deployment; a distributed store can replace it behind
/// <see cref="ISessionHandoffStore"/> without touching the service or endpoint.
/// </summary>
public sealed class InMemorySessionHandoffStore : ISessionHandoffStore
{
    private readonly ConcurrentDictionary<string, SessionHandoffTicket> _tickets =
        new(StringComparer.Ordinal);

    private readonly TimeProvider _clock;

    public InMemorySessionHandoffStore(TimeProvider? clock = null)
    {
        _clock = clock ?? TimeProvider.System;
    }

    public void Store(string codeHash, SessionHandoffTicket ticket)
    {
        EvictExpired();
        _tickets[codeHash] = ticket;
    }

    public SessionHandoffTicket? Consume(string codeHash)
    {
        // TryRemove is the atomic single-use gate: even concurrent callers
        // cannot both observe the same ticket.
        if (!_tickets.TryRemove(codeHash, out var ticket))
        {
            return null;
        }

        return ticket.ExpiresAt <= _clock.GetUtcNow() ? null : ticket;
    }

    private void EvictExpired()
    {
        var now = _clock.GetUtcNow();
        foreach (var pair in _tickets)
        {
            if (pair.Value.ExpiresAt <= now)
            {
                _tickets.TryRemove(pair.Key, out _);
            }
        }
    }
}
