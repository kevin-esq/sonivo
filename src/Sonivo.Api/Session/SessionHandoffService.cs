using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace Sonivo.Api.Session;

/// <summary>
/// Issues and redeems cross-subdomain session handoff codes per OWASP session
/// guidance and draft-moros-oauth-browser-session-handoff: 256-bit CSPRNG codes,
/// opaque, single-use, TTL &lt;= 120 s, stored only as a SHA-256 hash, with an
/// advisory User-Agent binding.
/// </summary>
public sealed class SessionHandoffService
{
    /// <summary>Handoff code lifetime (90 s, well under the 120 s ceiling).</summary>
    public static readonly TimeSpan TicketLifetime = TimeSpan.FromSeconds(90);

    private readonly ISessionHandoffStore _store;
    private readonly TimeProvider _clock;

    public SessionHandoffService(ISessionHandoffStore store, TimeProvider clock)
    {
        _store = store;
        _clock = clock;
    }

    public SessionHandoffCreated Create(
        Guid userId,
        Guid? groupId,
        string? slug,
        string? userAgent)
    {
        // 32 random bytes = 256 bits of entropy.
        var code = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var expiresAt = _clock.GetUtcNow().Add(TicketLifetime);

        var ticket = new SessionHandoffTicket(
            userId,
            groupId,
            slug,
            HashUserAgent(userAgent),
            expiresAt);

        _store.Store(HashCode(code), ticket);
        return new SessionHandoffCreated(code, expiresAt);
    }

    public SessionHandoffTicket? Consume(string code, string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return null;
        }

        var ticket = _store.Consume(HashCode(code));
        if (ticket is null || ticket.ExpiresAt <= _clock.GetUtcNow())
        {
            return null;
        }

        // Advisory binding: a code issued to one client should not be redeemed
        // from a materially different one. Mismatch burns the single-use code.
        if (!string.Equals(ticket.UserAgentHash, HashUserAgent(userAgent), StringComparison.Ordinal))
        {
            return null;
        }

        return ticket;
    }

    /// <summary>Stable SHA-256 hex digest of the (possibly absent) User-Agent.</summary>
    public static string HashUserAgent(string? userAgent)
    {
        var normalized = userAgent ?? string.Empty;
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(hash);
    }

    private static string HashCode(string code)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(code));
        return Convert.ToHexString(hash);
    }
}

/// <summary>Result of issuing a handoff: the one-time code and its expiry.</summary>
public sealed record SessionHandoffCreated(string Code, DateTimeOffset ExpiresAt);
