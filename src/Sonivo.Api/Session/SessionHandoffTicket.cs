namespace Sonivo.Api.Session;

/// <summary>
/// A pending cross-subdomain session handoff. The code itself is never stored;
/// only its SHA-256 hash is used as the store key (see
/// <see cref="SessionHandoffService"/>). The User-Agent hash is advisory
/// defense-in-depth (draft-moros-oauth-browser-session-handoff) and never
/// substitutes for the single-use + short-TTL guarantees.
///
/// Scope (ADR-0067): a ticket with a <see cref="GroupId"/> is a **tenant**
/// handoff (redeem re-verifies membership); a ticket without one is an
/// **app** handoff (the product host `app.sonivo.lat`, no group to authorize).
/// </summary>
public sealed record SessionHandoffTicket(
    Guid UserId,
    Guid? GroupId,
    string? Slug,
    string UserAgentHash,
    DateTimeOffset ExpiresAt)
{
    /// <summary>True for a user-scoped handoff to the app host (no group).</summary>
    public bool IsAppScope => GroupId is null;
}
