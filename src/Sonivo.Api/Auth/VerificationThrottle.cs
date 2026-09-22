using Sonivo.Application.Abstractions;

namespace Sonivo.Api.Auth;

/// <summary>
/// T-AU-01: per-email cooldown for verification resends (60 s).
/// In-memory fixed window; process-local is sufficient for the thin slice
/// (single-instance sessions; absolute cap deferred per ADR-0038).
/// Inject <see cref="IClock"/> so unit tests can advance time deterministically.
/// </summary>
public sealed class VerificationThrottle
{
    public static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);

    private readonly IClock _clock;
    private readonly object _gate = new();
    private readonly Dictionary<string, DateTimeOffset> _lastClaimByKey =
        new(StringComparer.OrdinalIgnoreCase);

    public VerificationThrottle(IClock clock)
    {
        _clock = clock;
    }

    /// <summary>
    /// Returns true when the caller may send now (and records the send);
    /// false when a send for the same key happened inside the cooldown window.
    /// </summary>
    public bool TryClaim(string key)
    {
        lock (_gate)
        {
            var now = _clock.UtcNow;
            if (_lastClaimByKey.TryGetValue(key, out var last)
                && now - last < ResendCooldown)
            {
                return false;
            }

            _lastClaimByKey[key] = now;
            return true;
        }
    }
}
