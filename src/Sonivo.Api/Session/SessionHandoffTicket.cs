namespace Sonivo.Api.Session;

/// <summary>
/// A pending cross-subdomain session handoff. The code itself is never stored;
/// only its SHA-256 hash is used as the store key (see
/// <see cref="SessionHandoffService"/>). The User-Agent hash is advisory
/// defense-in-depth (draft-moros-oauth-browser-session-handoff) and never
/// substitutes for the single-use + short-TTL guarantees.
/// </summary>
public sealed record SessionHandoffTicket(
    Guid UserId,
    Guid GroupId,
    string Slug,
    string UserAgentHash,
    DateTimeOffset ExpiresAt);
