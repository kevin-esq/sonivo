namespace Sonivo.Api.Auth;

/// <summary>
/// L1 (SECURITY-AUDIT-2026-09): absolute session cap. Sliding renewal keeps an
/// active session alive by refreshing the 14-day <c>ExpireTimeSpan</c>; this
/// policy adds a hard ceiling so no session outlives 30 days from the moment
/// it was issued, regardless of activity. Pure so it is trivially testable.
/// </summary>
public static class SessionAbsolutePolicy
{
    /// <summary>AuthenticationProperties.Items key holding the original sign-in instant.</summary>
    public const string IssuedUtcProperty = "SessionIssuedUtc";

    /// <summary>Product decision (SECURITY-AUDIT-2026-09 L1): 30 days.</summary>
    public static readonly TimeSpan AbsoluteLifetime = TimeSpan.FromDays(30);

    /// <summary>True when the session has outlived the absolute cap (strictly greater than 30 days).</summary>
    public static bool IsExpired(DateTimeOffset issuedUtc, DateTimeOffset nowUtc) =>
        nowUtc - issuedUtc > AbsoluteLifetime;
}
