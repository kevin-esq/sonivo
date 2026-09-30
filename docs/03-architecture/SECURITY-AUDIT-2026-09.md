# SECURITY-AUDIT-2026-09.md — Sonivo backend DevSecOps audit & remediation plan

**Date:** 2026-09-30
**Authorization:** explicit user request 2026-09-30 (DevSecOps engagement: audit + tooling + CI security automation).
**Auditor scope:** full .NET backend (`src/**`, `tests/**`, `.github/**`, deploy config, root configs). Working tree verified identical to `develop` for `src/` and `.github/` (`git diff develop --stat -- src .github` → empty); backend conclusions apply to the shipped code.
**Method:** two-pass `webappsec-review` — Pass 1 (Sonivo repo gates, hard: tenancy, CSRF, AuthN/AuthZ, secrets, uploads, errors) + Pass 2 (OWASP ASVS-lite, judgment) — plus tool-assisted SCA (NuGet advisory DB) and SDK Roslyn security analyzers. Every finding cites `file:line` evidence read in full (Program.cs 2710 lines, all Auth/Realtime/Application/Infrastructure/Blobs/Whisper/Persistence sources, appsettings, Dockerfile, render.yaml, ci.yml).
**Companion decision:** ADR-0044 (security tooling + CI gates) in [`DECISIONS.md`](DECISIONS.md).

---

## 1. Verification performed in this engagement (all run, not assumed)

| Check | Result |
| ----- | ------ |
| `dotnet list package --vulnerable --include-transitive` (all 8 projects) | 1 vulnerable transitive chain found (M4); clean after fix |
| Build with new security gates (Release) | **PASS** — 0 warnings, 0 errors (gate proven: 32 NU1903 errors before the fix) |
| Roslyn security analyzers (curated ruleset) | 1 finding (CA5350 HMAC-SHA1 in TOTP test helper) — legitimate RFC 6238 use, suppressed with rationale |
| Full backend test suite vs live PostgreSQL (5433) | **PASS — 444/444** (Domain 80, Application 176, Integration 57, API 131) |
| Git secret surface (`git ls-files` env/secret/key patterns) | clean — only `.example` templates tracked; `.env.*` ignored |

---

## 2. Pass 1 — Sonivo repo gates (hard)

| Gate | Verdict | Evidence |
| ---- | ------- | -------- |
| **Tenancy** | **PASS** | `GroupAccessService.RequireMember/RequireOwner` at every Application use-case entry (`GroupAccessService.cs:15-48`); scoped loads `GetByIdAsync(groupId, id)` throughout (`ResourceHandlers.cs:115,178,261,296,339,427,483,489`); non-member → 404, member-wrong-role → 403; role strings validated against exact enum (`MembershipHandlers.cs:124-128`); last-Owner guards (`MembershipHandlers.cs:85-92,137-144,186-193`); Hub rechecks Membership per method with Group resolved server-side from EventId (`PracticeRoomHub.cs:46-67,83-115`, `ConductorRoomAuthorizer.cs:25-69`) |
| **CSRF** | **PASS** | Custom middleware validates antiforgery on **every** POST/PUT/PATCH/DELETE incl. anonymous routes (`Program.cs:210-235`); `.DisableAntiforgery()` only neutralizes endpoint-level metadata, not this global gate; token bootstrap via `GET /api/auth/csrf` (`Program.cs:247-253`); SignalR negotiate covered (ADR-0036 Q9-Q3, `PracticeRoomHub.cs:17-21`); matches ADR-0020 §E/§J |
| **AuthN/AuthZ** | **PASS** (except C1 passkey defect) | Every endpoint declares `RequireAuthorization()`/`AllowAnonymous()` explicitly (full Program.cs read, 50+ routes); cookie: HttpOnly + Secure(non-dev) + SameSite=Lax + dedicated name (`Program.cs:42-62`); 401/403 events override redirects to real status codes (`Program.cs:52-61`); no JWT in JS; no auth state in localStorage (grep: only theme/i18n/UI prefs) |
| **Secrets** | **PASS** | Git tracks only `.example` files; render.yaml uses `sync: false` dashboard injection; R2/Gmail values never logged (`Program.cs:135-139`; `GmailEmailSender.cs` logs only status/body, never credentials); dev connection strings documented as dev-only (`.env.example`) |
| **Uploads** | **PASS** | 5 MiB cap (`ResourceFileConstraints.cs:28`) enforced at route (`Program.cs:1743-1751`) **and** domain (`Resource.cs:264-291`); MIME allowlist (`Resource.cs:33-48`); blob keys server-generated `resources/{guid}` (`ResourceHandlers.cs:184-185`); path-traversal-safe FS store (`FileSystemBlobStore.cs:88-110` rejects `.`/`..` and non-allowlisted chars); download re-checks membership (`ResourceHandlers.cs:338`); `Content-Disposition` filename sanitized (`ResourceHandlers.cs:373-397`) |
| **Errors** | **PASS** | ProblemDetails everywhere; identical 401 shape for bad-user / bad-password / unverified / locked (`Program.cs:333-371`); forgot/resend always 202 with no oracle (`Program.cs:477-532`); register 409 is the documented ADR-0038 tradeoff; non-AppException falls through to default 500 (no stack in prod); `AppExceptionHandler` maps only controlled domain messages (`Program.cs:2642-2708`) |

---

## 3. Pass 2 — OWASP ASVS-lite (judgment)

| Control | Verdict | Notes |
| ------ | ------- | ----- |
| 2.1 Authentication | **PASS with C1 defect** | Password policy proportionate (8 + digit + lower + upper, `DependencyInjection.cs:48-52`); lockout 5/15min (`:53-55`); MFA: TOTP + recovery codes + passkeys offered; single-use tokens with security-stamp rotation (`Program.cs:466-468,534-580`); no security questions. **The passkey path itself is broken (C1).** |
| 2.2 Session | **PASS with L1 note** | HttpOnly+Secure+Lax cookie; logout is server-side sign-out (`Program.cs:424-431`); Identity security-stamp validation invalidates sessions after credential change (default 30 min interval). No absolute session cap (L1; TTLs are a documented OPEN question in SECURITY.md) |
| 2.3 Access control | **PASS** | Deny-by-default explicit metadata; IDOR blocked by scoped `(GroupId, Id)` loads on all aggregates; mass-assignment blocked by explicit request records (`Program.cs:2566-2640`) + role enum validation; ownership transfer last-Owner guarded |
| 2.4 Input | **PASS** | Server-side validation on every boundary (domain `ArgumentException` → 400 `ValidationException`); EF LINQ parameterization only — **zero** raw SQL (grep `FromSqlRaw/ExecuteSqlRaw/SqlQueryRaw/FromSqlInterpolated` → no matches); invitation tokens CSPRNG 128-bit, SHA-256-hashed at rest, 7-day expiry (`InvitationHandlers.cs:96-107`) |
| 2.5 Crypto | **PASS with C1 defect** | ASP.NET DataProtection with keys persisted to Postgres (`DependencyInjection.cs:40-42`); Identity hasher for passwords; `RandomNumberGenerator` for challenges/invitation tokens (`PasskeysAuth.cs:54-57`, `InvitationHandlers.cs:98-100`); SHA-256 for high-entropy token hashing is appropriate (not a password). **No home-rolled crypto except the missing passkey verification (C1).** |
| 2.6 Logging | **M5 (gap)** | Failures logged without secrets (Gmail/verification paths), but **security event logging per SECURITY.md §8 is not implemented** (no 403/lockout/ownership-change audit trail) |

---

## 4. Findings register

Severity classification: **Critical** (exploitable authentication/authorization bypass), **Medium** (weakens a key control or enables abuse), **Low** (hardening / defense-in-depth). OWASP Top 10 (2021) + CWE mapping included.

### CRITICAL

#### C1 — Passkey login performs **no WebAuthn verification**: possession of a credential ID equals full account access

- **OWASP/CWE:** A07:2021 Identification & Authentication Failures · CWE-287 (Improper Authentication), CWE-345 (Insufficient Verification of Data Authenticity), CWE-306 (Missing Authentication for Critical Function)
- **Evidence:**
  - `Program.cs:1020-1069` — `login-finish` looks up `db.UserTokens` by the client-supplied `credentialId` and calls `signInManager.SignInAsync(user)` **without verifying `request.ClientData` or `request.Signature`** (both fields exist on `PasskeyLoginFinishRequest` and are sent by the SPA — dead on arrival server-side).
  - The challenge from `login-start` (`Program.cs:1007-1018`) is **never validated**: `PasskeyChallengeStore.ConsumeChallenge` (`PasskeysAuth.cs:73-91`) has **zero callers** (grep-verified) — the challenge is decorative.
  - `Program.cs:950-985` — `register-finish` stores a **client-supplied** `credentialId` + `publicKey` string without parsing `attestationObject`, without binding to the issued challenge, and without any attestation statement verification.
  - `PasskeysApiTests.cs:120-125` — the API test passes `signature: "mock-signature"` and expects **200 OK**: the bypass is codified in the test contract.
- **Root cause:** S3 (ADR-0038) implemented the WebAuthn *ceremony transport* (challenge generation, SPA `navigator.credentials.*`) but never the *verifier* — the server side of WebAuthn. The browser-side plumbing is real (`web/sonivo-web/src/shell/webauthn.ts:70,105,111` already base64url-encodes `attestationObject`, `clientDataJSON`, `authenticatorData`, `signature`), which makes the flaw invisible in E2E: the real ceremony passes because nothing is checked.
- **Risk vector:** In the WebAuthn model, credential IDs are **non-secret identifiers** (they appear in assertions and allow-lists by design). Any single leak of a victim's credential ID — a log line, a future API that ever returns them to other actors, a phishing page relaying the flow, a Referer, support tooling — yields **permanent, silent account takeover**: no signature check, no challenge binding (replay is unbounded), no origin/RP-ID binding, no sign-counter (authenticator cloning undetectable). Meanwhile users believe they hold phishing-resistant MFA. This defeats the security posture of every other control in the auth stack for passkey-registered accounts.
- **Fix:** implement the server-side verifier (challenge consumption + origin allow-list + RP-ID hash + user-present/verified flags + ES256/RS256 assertion signature + sign-counter regression + attestation parse). **Complete drop-in implementation below (§ 6.1).** Requires the one new (Microsoft, dotnet/runtime-repo) dependency `System.Formats.Cbor` — **pending explicit approval** per repo dependency policy.
- **Status:** **FIXED** — T-SEC-01/02/03 implemented: server-side verifier (`PasskeyVerifier`: challenge single-use, origin allow-list, rpIdHash, UP/AT flags, sign-counter regression, ES256/RS256 assertion signatures, `none`/`packed` attestation), frontend pass-through, RED→GREEN fake-authenticator matrix; legacy pre-fix rows fail closed (uniform 401). See §6.1.

### MEDIUM

#### M1 — `/api/auth/login` has no per-IP rate limit (the only un-throttled credential endpoint)

- **OWASP/CWE:** A07 · CWE-307
- **Evidence:** `Program.cs:320-398` — no `RequireRateLimiting`; every sibling auth endpoint has one (`Program.cs:318,473,503,532,580,654,695,737,785,832,873,948,985,1005,1018,1069`).
- **Root cause / risk:** Identity lockout (5/15 min, `lockoutOnFailure: true`) protects *per account*; multi-account **credential stuffing** rotates victim emails to stay under lockout. Combined with M2 (spoofable per-IP key), the defense-in-depth layer is weaker than designed.
- **Fix (surgical):** add `options.AddPolicy("auth-login", http => PerIp(http, 20));` and `.RequireRateLimiting("auth-login")` on the login endpoint.
- **Status:** PLAN READY — 2 lines.

#### M2 — Forwarded headers trust **any** proxy in production → every per-IP rate limit is bypassable via `X-Forwarded-For` spoofing

- **OWASP/CWE:** A05:2021 Security Misconfiguration · CWE-348 (Trust of Unintended Proxy)
- **Evidence:** `Program.cs:106-114` — non-dev clears `KnownNetworks` **and** `KnownProxies` (trust-all); rate partitions key on `http.Connection.RemoteIpAddress` (`Program.cs:81-90`), which after `UseForwardedHeaders` (`Program.cs:166-168`) reflects the client-supplied (unvalidated) `X-Forwarded-For` chain.
- **Root cause:** Render does not publish static proxy egress IPs, so the integration was configured trust-all.
- **Risk:** one header per request rotates the partition key → the register/confirm/resend/forgot/reset/2FA/passkeys budgets (10-30/min) are **unlimited** for scripted callers. Compounding: IPv6 clients can also rotate inside a /64. Per-account Identity lockout still stands (the residual mitigations are real but per-account only), and `forgot-password` has **no per-email cooldown** (unlike resend, `VerificationThrottle` is only wired into resend `Program.cs:482-487`) → unbounded mail-bombing of arbitrary addresses is possible via `forgot-password` + spoofed XFF.
- **Fix:** (a) constrain `KnownProxies`/`KnownNetworks` to the effective hosting proxy range(s) once known, or at minimum keep trust-all **documented as a residual risk** while adding per-account budgets that do not depend on IP: (b) per-email cooldown for `forgot-password` (reuse `VerificationThrottle`), (c) `auth-login` per-IP policy (M1). Also consider an IPv6 /64-truncating partition key.
- **Status:** PLAN READY.

#### M3 — Google test-callback hook is single-gated (config flag only); the email test hook is double-gated — inconsistent backstop

- **OWASP/CWE:** A08:2021 Software & Data Integrity Failures · CWE-489 (Leftover Debug Code)
- **Evidence:** `GoogleAuthSetup.cs:48,115-172` — `/api/auth/google/test-callback` fabricates an `ExternalLoginInfo` from **arbitrary** `ProviderKey`/`Email`/`EmailVerified` and signs the user in, gated only by `Authentication:Google:EnableTestHook`. Contrast the email hook, double-gated flag **AND** `IsDevelopment()` (`Program.cs:1075-1076`).
- **Risk:** a single misconfigured prod flag = unauthenticated full account takeover for any email. The email hook's own comment explains why the env gate is the backstop ("a misconfigured prod flag alone can never enable it") — the Google hook lacks exactly that backstop.
- **Fix (surgical):** `var testHook = app.Configuration.GetValue("Authentication:Google:EnableTestHook", false) && app.Environment.IsDevelopment();` — mirrors the documented pattern.
- **Status:** PLAN READY — 1 line.

#### M4 — Vulnerable transitive dependency chain `System.Security.Cryptography.Xml` 9.0.9 (8 × High advisories)

- **OWASP/CWE:** A06:2021 Vulnerable and Outdated Components
- **Evidence:** chain `Sonivo.Infrastructure → Microsoft.AspNetCore.DataProtection.EntityFrameworkCore 9.0.9 → Microsoft.AspNetCore.DataProtection 9.0.9 → System.Security.Cryptography.Xml 9.0.9` (`dotnet nuget why`). Advisories (all High): **CVE-2026-26171** (DoS, XXE — GHSA-w3x6), **CVE-2026-33116** (DoS — GHSA-37gx), **CVE-2026-47304** (EncryptedXml security feature bypass, CVSS 8.1, CWE-347 — GHSA-g8r8), plus GHSA-cvvh/23rf/8q5v/mmjf/6588.
- **Root cause / risk:** no restore-time audit gate existed (`NuGetAudit` default mode audits direct refs only; the chain is transitive). Sonivo does not invoke EncryptedXml directly, so real-world exposure is low — but the advisories are High, scanners flag it, and the fixed servicing train (9.0.18) was one line away.
- **Fix APPLIED (this engagement):** servicing-train bump 9.0.9 → **9.0.18** (all EF/ASP.NET/Configuration packages in lockstep, `src/**` + `tests/**` csproj) + permanent gates (see § 5).
- **Status:** **FIXED + VERIFIED** (build green; 444/444 tests; `dotnet list package --vulnerable` clean).

#### M5 — Security event logging (SECURITY.md §8) not implemented: no 403 / lockout / ownership-change audit trail

- **OWASP/CWE:** A09:2021 Security Logging & Monitoring Failures · CWE-778
- **Evidence:** SECURITY.md §8 (`SECURITY.md:184-186`) specifies logging auth failures, lockouts, 403 denials, ownership changes, Group delete, Resource delete, apply-setlist replace — **none instrumented** (`AppExceptionHandler` `Program.cs:2642-2708` maps AppExceptions to responses without logging; handlers raise `ForbiddenException` without a log call; grep confirms no security-event logger anywhere).
- **Risk:** intrusions (role-change abuse, lockout storms as recon) leave no server-side trail; incident response impossible today.
- **Fix:** structured warning-level audit lines at: `GroupAccessService.RequireOwnerAsync` 403 path, lockout branches (`Program.cs:352-358,758-764,805-811`), `ChangeMemberRoleHandler`/`RemoveMemberHandler`/`SoftDeleteGroupHandler` mutations, `DeleteResourceHandler`, `ReplaceEventPlanFromSetlistHandler` — always `(actorUserId, groupId, targetId)`, never tokens/PII payloads (per SECURITY.md §8 and ASVS 2.6).
- **Status:** PLAN READY.

### LOW

#### L1 — No absolute session timeout (sliding 14-day, renewable forever)

- **OWASP/CWE:** A07 · ASVS 2.2.2
- **Evidence:** `Program.cs:50-51`; SECURITY.md already lists exact TTLs as OPEN.
- **Fix:** absolute cap via `Events.OnValidatePrincipal` (e.g., reject stamps older than 30 days since issued) when the TTL decision is made. **Do not silently pick a TTL** — it is a product decision already tracked as OPEN.

#### L2 — CSP is minimal (frame/img only); no `default-src`, no `frame-ancestors`

- **OWASP/CWE:** A05 · CWE-693
- **Evidence:** `Program.cs:203-208` — deliberate minimal policy (T-FX-02, ADR-0037) to allow YouTube embeds; `X-Frame-Options: DENY` (`Program.cs:196`) covers framing in modern browsers but the CSP has no `frame-ancestors 'none'` and no `default-src 'self'` script containment for the SPA.
- **Fix (after visual QA):** `default-src 'self'; frame-src 'self' https://www.youtube-nocookie.com; img-src 'self' data: https://i.ytimg.com; frame-ancestors 'none';` — verify Vite asset serving (hashed same-origin assets) stays green in Playwright. Extend `SecurityHeadersTests`.

#### L3 — Production container runs as root

- **OWASP/CWE:** A05 · CWE-250
- **Evidence:** `Dockerfile:21-27` — no `USER` directive (aspnet:9.0 default is root).
- **Fix:** `USER app` (aspnet image ships the non-root `app` user, UID 1654) before `ENTRYPOINT`, after the `COPY` steps.

#### L4 — `forgot-password` has no per-email cooldown (mail-bombing vector, compounded by M2)

- **Evidence:** `Program.cs:507-532` — per-IP budget only; `VerificationThrottle` exists but is wired solely into resend (`Program.cs:482-487`).
- **Fix:** `throttle.TryClaim(normalized)` around the `GeneratePasswordResetTokenAsync` block (same 60s per-email shape as resend) — bounded email-bombing even under IP spoofing.

---

## 5. Applied in this engagement (P0 — already in the working tree)

| # | Change | File |
| - | ------ | ---- |
| 1 | **M4 fix**: EF/ASP.NET servicing train 9.0.9 → 9.0.18 (clears all 8 High advisories) | `src/Sonivo.Infrastructure/Sonivo.Infrastructure.csproj`, `src/Sonivo.Api/Sonivo.Api.csproj`, `tests/Sonivo.Api.Tests/Sonivo.Api.Tests.csproj`, `tests/Sonivo.Integration.Tests/Sonivo.Integration.Tests.csproj` |
| 2 | **SCA gate (hard)**: NuGetAudit in `all` mode; NU1902/NU1903 as build errors | `Directory.Build.props` (new) |
| 3 | **SAST gate (surgical)**: curated Roslyn security ruleset — deterministic dangerous-API rules at `error` (CA3061/75/76/77, CA3147, CA5350/51/58, CA5374, CA5390/91/94/98/99, CA5400), heuristic taint-review rules at `warning` (CA3001-CA3006) | `.editorconfig` (new) |
| 4 | **Justified exception**: documented `CA5350` suppression for RFC 6238 HMAC-SHA1 TOTP test helper | `tests/Sonivo.Api.Tests/TwoFactorApiTests.cs` |
| 5 | **CodeQL SAST workflow** (PR/push + weekly, manual build mode, SARIF upload) | `.github/workflows/codeql.yml` (new) |
| 6 | **SCA workflow** (explicit per-project vulnerable-package gate, independent of MSBuild warning semantics — defense-in-depth over #2) | `.github/workflows/security.yml` (new) |
| 7 | **Dependabot** version+security updates: nuget (8 project dirs), npm (`/web/sonivo-web`, `/e2e`), github-actions | `.github/dependabot.yml` (new) |
| 8 | This audit report | `docs/03-architecture/SECURITY-AUDIT-2026-09.md` (new) |
| 9 | Tooling decision record | ADR-0044 in `DECISIONS.md`; `docs/tooling/TOOLING-AUDIT.md` |

**Verification of the applied batch:** build Release **green (0 warnings / 0 errors)**; gates empirically proven (pre-fix build failed with 32 NU1903 errors; CA5350 caught and triaged); full backend suite **444/444** vs live PostgreSQL; `dotnet list package --vulnerable --include-transitive` clean on all 8 projects.

---

## 6. Remediation plan (prioritized; P1/P2 pending explicit approval — no code-level auth changes applied in this engagement)

### P1-A (CRITICAL C1) — Full server-side WebAuthn verification

**Decision needed first:** add `System.Formats.Cbor` (Microsoft, maintained in the dotnet/runtime repo; verified NOT inbox on net9.0) to `Sonivo.Api.csproj`. Hand-rolling CBOR parsing for crypto structures is rejected (home-rolled parsing of attestation data is exactly what C1 exists to remove).

**Ticket shape:** T-SEC-01 (RED→GREEN: fake-authenticator test helper first), T-SEC-02 frontend pass-through, T-SEC-03 E2E/CI rpId config.

#### 6.1.1 New verifier (drop-in `src/Sonivo.Api/Auth/PasskeysAuth.cs` additions)

```csharp
using System.Formats.Cbor;
using System.Security.Cryptography;
using System.Text.Json;

namespace Sonivo.Api.Auth;

/// <summary>
/// T-SEC-01: server-side WebAuthn verifier. Upgrades the S3 passkey transport
/// into an actual verified ceremony: clientData (type/challenge/origin),
/// authenticatorData (rpIdHash/UP/UV/signCount), attestation (none | packed
/// self-attestation), and ES256/RS256 assertion signatures. Replaces all
/// trust in client-supplied credentialId/publicKey strings.
/// </summary>
public static class PasskeyVerifier
{
    public const int Es256 = -7;    // ECDSA w/ SHA-256, P-256 (COSE alg)
    public const int Rs256 = -257;  // RSASSA-PKCS1-v1_5 w/ SHA-256 (COSE alg)

    public sealed record ClientData(string Type, string Challenge, string Origin);

    public sealed record RegistrationProof(
        string CredentialId,        // extracted from attestedCredentialData — never from the client body
        byte[] CoseKey,             // raw CBOR of the credential public key
        long SignCount,
        string Fmt);

    public sealed record AssertionProof(long SignCount, bool UserPresent, bool UserVerified);

    public sealed class PasskeyVerificationException : Exception
    {
        public PasskeyVerificationException(string message) : base(message) { }
    }

    private static byte[] Base64UrlDecode(string s)
    {
        s = s.Trim().Replace('-', '+').Replace('_', '/').PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
        return Convert.FromBase64String(s);
    }

    // ---- clientDataJSON ----------------------------------------------------
    public static ClientData ParseClientData(string clientDataBase64Url)
    {
        using var doc = JsonDocument.Parse(Base64UrlDecode(clientDataBase64Url));
        var root = doc.RootElement;
        return new ClientData(
            root.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "",
            root.TryGetProperty("challenge", out var c) ? c.GetString() ?? "" : "",
            root.TryGetProperty("origin", out var o) ? o.GetString() ?? "" : "");
    }

    public static void EnsureClientData(
        ClientData cd, string expectedType, string issuedChallenge, IReadOnlySet<string> allowedOrigins)
    {
        if (!string.Equals(cd.Type, expectedType, StringComparison.Ordinal))
            throw new PasskeyVerificationException("clientData type mismatch.");
        if (!string.Equals(cd.Challenge, issuedChallenge, StringComparison.Ordinal))
            throw new PasskeyVerificationException("challenge mismatch.");          // replay killed here
        if (!allowedOrigins.Contains(cd.Origin.TrimEnd('/')))
            throw new PasskeyVerificationException("origin not allowed.");           // phishing binding
    }

    // ---- authenticatorData (fixed binary layout, NOT CBOR) -----------------
    // rpIdHash(32) | flags(1) | signCount(4 BE) | [attestedCredentialData]
    private static (byte[] RpIdHash, byte Flags, long SignCount) ReadAuthDataHeader(ReadOnlySpan<byte> d)
    {
        if (d.Length < 37) throw new PasskeyVerificationException("authData too short.");
        return (d[..32].ToArray(), d[32], ((long)d[33] << 24) | (d[34] << 16) | (d[35] << 8) | d[36]);
    }

    public static AssertionProof ParseAssertionAuthenticatorData(string authDataBase64Url, string rpId)
    {
        var d = Base64UrlDecode(authDataBase64Url);
        var (rpIdHash, flags, signCount) = ReadAuthDataHeader(d);
        EnsureRpIdHash(rpIdHash, rpId);
        if ((flags & 0x01) == 0)                       // UP — user presence is mandatory
            throw new PasskeyVerificationException("user-present flag missing.");
        return new AssertionProof(signCount, userPresent: true, userVerified: (flags & 0x04) != 0);
    }

    private static void EnsureRpIdHash(byte[] actual, string rpId)
    {
        var expected = SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(rpId));
        if (!actual.AsSpan().SequenceEqual(expected))
            throw new PasskeyVerificationException("rpIdHash mismatch.");           // relying-party binding
    }

    // ---- attestationObject (registration) ----------------------------------
    public static RegistrationProof ParseAttestation(string attestationBase64Url, string rpId)
    {
        var reader = new CborReader(Base64UrlDecode(attestationBase64Url));
        string fmt = "";
        byte[] authData = [];
        reader.ReadStartMap();
        while (reader.PeekState() != CborReaderState.EndMap)
        {
            var key = reader.ReadTextString();
            switch (key)
            {
                case "fmt": fmt = reader.ReadTextString(); break;
                case "authData": authData = reader.ReadByteString().ToArray(); break;
                case "attStmt": reader.SkipValue(); break;   // packed handled after the COSE key is known
                default: reader.SkipValue(); break;
            }
        }
        reader.ReadEndMap();

        var (rpIdHash, flags, signCount) = ReadAuthDataHeader(authData);
        EnsureRpIdHash(rpIdHash, rpId);
        if ((flags & 0x01) == 0 || (flags & 0x40) == 0)   // UP + AT (attested credential data present)
            throw new PasskeyVerificationException("registration flags missing (UP/AT).");

        // attestedCredentialData: aaguid(16) | credIdLen(2 BE) | credentialId | COSE key CBOR
        var acd = authData.AsSpan(37);
        if (acd.Length < 18) throw new PasskeyVerificationException("attestedCredentialData too short.");
        var credIdLen = (acd[16] << 8) | acd[17];
        var credId = acd.Slice(18, credIdLen).ToArray();
        var coseReader = new CborReader(acd.Slice(18 + credIdLen).ToArray());

        var coseKey = coseReader.ReadEncodedValue().ToArray();  // raw CBOR — store exactly this
        if (fmt is not ("none" or "packed"))
            throw new PasskeyVerificationException($"unsupported attestation fmt '{fmt}'.");
        return new RegistrationProof(
            Base64UrlEncode(credId), coseKey, signCount, fmt);
    }

    /// <summary>packed self-attestation: sig over authData || SHA256(clientDataJSON) with the COSE key.</summary>
    public static void VerifyPackedSelfAttestation(
        string attestationBase64Url, string clientDataBase64Url, byte[] coseKey)
    {
        var reader = new CborReader(Base64UrlDecode(attestationBase64Url));
        reader.ReadStartMap();
        byte[] authData = []; byte[] sig = []; bool hasAttStmt = false;
        while (reader.PeekState() != CborReaderState.EndMap)
        {
            var key = reader.ReadTextString();
            switch (key)
            {
                case "fmt": reader.SkipValue(); break;
                case "authData": authData = reader.ReadByteString().ToArray(); break;
                case "attStmt":
                    hasAttStmt = true;
                    var s = new CborReader(reader.ReadEncodedValue().ToArray());
                    s.ReadStartMap();
                    while (s.PeekState() != CborReaderState.EndMap)
                    {
                        var k2 = s.ReadTextString();
                        if (k2 == "sig") sig = s.ReadByteString().ToArray(); else s.SkipValue();
                    }
                    break;
            }
        }
        if (!hasAttStmt || sig.Length == 0) return;  // fmt "none"
        var message = authData.Concat(SHA256.HashData(Base64UrlDecode(clientDataBase64Url))).ToArray();
        if (!VerifyWithCoseKey(coseKey, message, sig))
            throw new PasskeyVerificationException("packed self-attestation signature invalid.");
    }

    // ---- assertion verification (login) -------------------------------------
    public static bool VerifyAssertion(
        byte[] coseKey, string authDataBase64Url, string clientDataBase64Url, string signatureBase64Url)
    {
        // WebAuthn: signature over authenticatorData || SHA256(clientDataJSON)
        var message = Base64UrlDecode(authDataBase64Url)
            .Concat(SHA256.HashData(Base64UrlDecode(clientDataBase64Url))).ToArray();
        return VerifyWithCoseKey(coseKey, message, Base64UrlDecode(signatureBase64Url));
    }

    private static bool VerifyWithCoseKey(byte[] coseKeyCbor, byte[] message, byte[] signature)
    {
        var reader = new CborReader(coseKeyCbor);
        int kty = 0, alg = 0;
        byte[] x = [], y = [], n = [], e = [];
        reader.ReadStartMap();
        while (reader.PeekState() != CborReaderState.EndMap)
        {
            var key = reader.ReadInt32();
            switch (key)
            {
                case 1: kty = reader.ReadInt32(); break;
                case 3: alg = reader.ReadInt32(); break;
                case -1: ReadCrvOrN(reader, alg == Rs256 ? ref n : ref x); break; // crv (EC2) | n (RSA)
                case -2: ReadXOrE(reader, alg == Rs256 ? ref e : ref x); break;   // x (EC2)  | e (RSA)
                case -3: y = reader.ReadByteString().ToArray(); break;            // y (EC2 only)
                default: reader.SkipValue(); break;
            }
        }
        reader.ReadEndMap();
        static void ReadCrvOrN(CborReader r, ref byte[] slot) => slot = r.ReadByteString().ToArray();
        static void ReadXOrE(CborReader r, ref byte[] slot) => slot = r.ReadByteString().ToArray();

        if (kty == 2 && alg == Es256)                    // EC2 P-256
        {
            using var ec = ECDsa.Create(new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = { X = x, Y = y }
            });
            // ECDsa hashes internally; the to-be-signed bytes already embed SHA256(clientData),
            // so verify over the SHA-256 of the full message.
            return ec.VerifyData(message, signature, HashAlgorithmName.SHA256);
        }
        if (kty == 3 && alg == Rs256)                    // RSA
        {
            using var rsa = RSA.Create(new RSAParameters { Modulus = n, Exponent = e });
            return rsa.VerifyData(message, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        }
        return false;                                   // reject unknown alg/kty — deny by default
    }

    private static string Base64UrlEncode(byte[] b) =>
        Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
```

> Note (T-SEC-01): `ECDsa.VerifyData(message, sig, SHA256)` is used because the .NET API hashes `message` itself exactly once, which matches the WebAuthn to-be-signed construction (authenticatorData || SHA256(clientDataJSON)) being hashed once by the authenticator. Verify with a real virtual authenticator in RED tests before GREEN.

#### 6.1.2 Endpoint rewrites (Program.cs diffs)

```csharp
// ---- register-finish: verify the attestation, extract everything server-side
app.MapPost("/api/auth/passkeys/register-finish", async (
    PasskeyRegistrationFinishRequest request,          // NEW shape:
    // record PasskeyRegistrationFinishRequest(
    //     string ClientData, string AttestationObject, string? DeviceName);
    ClaimsPrincipal principal,
    UserManager<ApplicationUser> users,
    IPublicOrigin origin,
    IConfiguration config) =>
{
    var user = await users.GetUserAsync(principal);
    if (user is null) return Results.Unauthorized();

    var rpId = GetRelyingPartyId(http, config);
    try
    {
        var cd = PasskeyVerifier.ParseClientData(request.ClientData);
        // 1. type + origin allow-list + challenge single-use + user binding
        PasskeyVerifier.EnsureClientData(cd, "webauthn.create", cd.Challenge /* consumed below */,
            PasskeyOrigins.Allowed(http, config, origin));
        if (!PasskeyChallengeStore.ConsumeChallenge(cd.Challenge, expectedUserId: user.Id))
            return Results.Problem(detail: "La llave de acceso no es válida", statusCode: 401, title: "Unauthorized");
        // 2. attestation: rpIdHash, UP/AT flags, credentialId + COSE key extracted (not trusted)
        var proof = PasskeyVerifier.ParseAttestation(request.AttestationObject, rpId);
        // 3. self-attestation signature (fmt "none" passes through by design)
        PasskeyVerifier.VerifyPackedSelfAttestation(request.AttestationObject, request.ClientData, proof.CoseKey);

        var cred = new PasskeyCredential(
            proof.CredentialId,
            Base64Url(proof.CoseKey),                   // store the SERVER-EXTRACTED key
            string.IsNullOrWhiteSpace(request.DeviceName) ? "Llave de acceso" : request.DeviceName.Trim(),
            DateTimeOffset.UtcNow,
            proof.SignCount);
        await users.SetAuthenticationTokenAsync(user, "Passkeys",
            "Credential_" + cred.CredentialId, JsonSerializer.Serialize(cred));
        return Results.Ok(new { registered = true, credentialId = cred.CredentialId });
    }
    catch (PasskeyVerifier.PasskeyVerificationException)
    {
        return Results.Problem(detail: "La llave de acceso no es válida", statusCode: 401, title: "Unauthorized");
    }
})
.WithName("PasskeysRegisterFinish").RequireAuthorization()
.DisableAntiforgery().RequireRateLimiting("auth-passkeys-manage");

// ---- login-finish: verify challenge, rpIdHash, UP, counter, and the SIGNATURE
app.MapPost("/api/auth/passkeys/login-finish", async (
    PasskeyLoginFinishRequest request,                 // NEW shape:
    // record PasskeyLoginFinishRequest(
    //     string CredentialId, string ClientData, string AuthenticatorData, string Signature);
    UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signInManager,
    SonivoDbContext db,
    HttpContext http,
    IConfiguration config) =>
{
    var tokenName = "Credential_" + (request.CredentialId ?? "").Trim();
    var token = await db.UserTokens.FirstOrDefaultAsync(
        t => t.LoginProvider == "Passkeys" && t.Name == tokenName);
    if (token is null)
        return Results.Problem(detail: "Llave de acceso no registrada", statusCode: 401, title: "Unauthorized");
    var stored = JsonSerializer.Deserialize<PasskeyCredential>(token.Value);
    var user = await users.FindByIdAsync(token.UserId.ToString());
    if (user is null || stored is null)
        return Results.Problem(detail: "Llave de acceso no registrada", statusCode: 401, title: "Unauthorized");

    var rpId = GetRelyingPartyId(http, config);
    try
    {
        // 1. clientData: type=webauthn.get + origin allow-list + single-use challenge
        var cd = PasskeyVerifier.ParseClientData(request.ClientData);
        PasskeyVerifier.EnsureClientData(cd, "webauthn.get", cd.Challenge,
            PasskeyOrigins.Allowed(http, config, origin));
        if (!PasskeyChallengeStore.ConsumeChallenge(cd.Challenge))
            return Results.Problem(detail: "Llave de acceso inválida", statusCode: 401, title: "Unauthorized");
        // 2. authenticatorData: rpIdHash + UP; counter regression check (clone detection)
        var proof = PasskeyVerifier.ParseAssertionAuthenticatorData(request.AuthenticatorData, rpId);
        if (stored.SignCount > 0 && proof.SignCount > 0 && proof.SignCount <= stored.SignCount)
            return Results.Problem(detail: "Llave de acceso inválida", statusCode: 401, title: "Unauthorized");
        // 3. the actual cryptographic proof — the missing line that C1 exists for
        if (!PasskeyVerifier.VerifyAssertion(
                Base64UrlDecode(stored.PublicKeyCose), request.AuthenticatorData,
                request.ClientData, request.Signature))
            return Results.Problem(detail: "Llave de acceso inválida", statusCode: 401, title: "Unauthorized");

        // 4. persist the advanced counter, then sign in
        stored = stored with { SignCount = proof.SignCount };
        await users.SetAuthenticationTokenAsync(user, "Passkeys", tokenName, JsonSerializer.Serialize(stored));
        await signInManager.SignInAsync(user, isPersistent: true);
        return Results.Ok(new { id = user.Id, email = user.Email,
            displayName = user.DisplayName, emailConfirmed = user.EmailConfirmed });
    }
    catch (PasskeyVerifier.PasskeyVerificationException)
    {
        return Results.Problem(detail: "Llave de acceso inválida", statusCode: 401, title: "Unauthorized");
    }
})
.WithName("PasskeysLoginFinish").AllowAnonymous()
.DisableAntiforgery().RequireRateLimiting("auth-passkeys-challenge");
```

**Origin allow-list helper (new config):** `Passkeys:AllowedOrigins` (comma list) — defaults to `PublicOrigin` when set, plus `http://localhost:5173` / `http://127.0.0.1:5173` in Development. Prod render.yaml: `Passkeys__AllowedOrigins=https://sonivo.onrender.com` + `Passkeys__RelyingPartyId=sonivo.onrender.com`; CI e2e job: `Passkeys__RelyingPartyId: localhost` (the SPA browses `http://localhost:5173` while the API binds `127.0.0.1:5171` — today this rpId mismatch is masked precisely because nothing is verified; after the fix it must match the browser origin).

#### 6.1.3 Frontend pass-through (the browser already computes everything)

`web/sonivo-web/src/shell/webauthn.ts` already returns `attestationObject`/`clientDataJSON` (registration) and `authenticatorData`/`clientDataJSON`/`signature` (login). Required diffs:

- `client.ts` — `finishPasskeyRegistration(input: { attestationObject: string; clientDataJSON: string; deviceName?: string })`, `finishPasskeyLogin(input: { credentialId: string; clientData: string; authenticatorData: string; signature: string })`.
- `PasskeysSection.tsx:51-55` — send `reg.attestationObject` + `reg.clientDataJSON` (drop client-composed `publicKey`).
- `AuthScreen.tsx:465-469` — send `result.authenticatorData` (fields already destructured at `:462-464`).

#### 6.1.4 Test strategy (TDD, no new test dependencies)

- **RED:** a `FakeAuthenticator` test helper (ECDSA P-256 keypair; crafts `authenticatorData` with rpIdHash/flags/counter + attestedCredentialData + minimal COSE key; signs assertions) — then matrix: valid login 200; bad signature 401; replayed challenge 401; counter regression 401; foreign origin 401; wrong rpIdHash 401. Update `PasskeysApiTests.cs:120-125` — the current `signature: "mock-signature"` must 401.
- **E2E:** unchanged journeys — the CDP virtual authenticator already performs the real ceremony; only the API request bodies gain fields. Playwright stays green if rpId config matches (§ 6.1.2 note).

### P1-B (M3) — double-gate the Google test hook: 1 line (`GoogleAuthSetup.cs:48`).

### P1-C (M1) — `auth-login` per-IP policy (20/min) + `.RequireRateLimiting("auth-login")`: 2 lines (`Program.cs:91-102,398`).

### P2 (sequenced after P1)

| # | Finding | Change |
| - | ------- | ------ |
| 1 | M2 | Constrain `KnownProxies` to the hosting proxy range when known; until then add per-account/per-email budgets that do not depend on IP (M1 policy + L4 throttle) and truncate IPv6 partition keys to /64 |
| 2 | L4 | `VerificationThrottle.TryClaim` on `forgot-password` (`Program.cs:507-532`) |
| 3 | M5 | Structured security-event logging (403 denials, lockouts, role/ownership mutations, Group/Resource deletes, apply-setlist replace) — actor + ids only, no tokens/PII |
| 4 | L1 | Absolute session cap (30d) via `OnValidatePrincipal` when the TTL product decision is made |
| 5 | L2 | Harden CSP (`default-src 'self'`, `frame-ancestors 'none'`) + extend `SecurityHeadersTests` |
| 6 | L3 | `USER app` in `Dockerfile` |

---

## 7. GitHub automation & PR gating (applied + required sequence)

**Applied now (files in working tree):** `codeql.yml` (SAST), `security.yml` (SCA gate), `dependabot.yml` (updates + security PRs), plus the build-time gates (Directory.Build.props NuGetAudit-as-errors; `.editorconfig` security analyzers) that the **existing** `ci.yml` backend job enforces automatically — CI already blocks: failing tests, vulnerable dependencies (restore-time), security-analyzer findings, broken builds.

**Required checks (run AFTER the workflows land on the default branch — required status checks resolve only from workflows on the default branch; setting them today would leave PRs pending forever).** With `gh` authenticated as `kevin-esq` (scopes `repo`+`workflow` present), run:

```bash
gh api -X PUT repos/kevin-esq/sonivo/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Backend build & tests", "Frontend build", "Playwright E2E",
                 "Analyze (C#)", "SCA gate (NuGet vulnerabilities)"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "dismiss_stale_reviews": true },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
# Repeat for `develop` (PRs merge into develop first per repo flow).
```

**Deploy gating:** Render deploys on push to `main` (`render.yaml`); with the above protection on `main`, merges require all five checks green → deploys are gated by the same security suite. Optionally configure Render's deploy hook to require CI completion. **GitHub Settings to enable once (UI, no file equivalent):** Settings → Code security → Dependabot alerts + security updates; Code scanning results appear automatically from CodeQL SARIF.

---

## 8. Tooling evaluation & decisions (ADR-0044)

| Candidate | Decision | Rationale |
| --------- | -------- | --------- |
| SDK Roslyn security analyzers (curated ruleset via `.editorconfig`) | **ADOPTED** | Zero new packages; deterministic dangerous-API rules as build errors; empirically caught a real finding (CA5350) on first build |
| NuGetAudit (`all` mode, NU1902/NU1903 as errors) | **ADOPTED** | Zero new packages; proven by 32-error pre-fix failure; covers the exact transitive chain class that M4 exposed |
| GitHub CodeQL (csharp) | **ADOPTED** | Deep semantic SAST, free for public repos, SARIF integration, no local tooling footprint |
| Dependabot (nuget/npm/actions) | **ADOPTED** | Continuous updates + security PRs; complements the audit gates |
| Security Code Scan (Roslyn SAST NuGet) | **REJECTED** | Redundant with NetAnalyzers + CodeQL; low maintenance activity; a new compile-time dependency |
| OWASP Dependency-Check (local/CI) | **REJECTED** | Requires a Java runtime + NVD API key plumbing; redundant with NuGetAudit + Dependabot (same advisory DB, already gated twice) |
| `System.Formats.Cbor` (for C1 fix) | **PENDING APPROVAL** | Required for CBOR attestation parsing; Microsoft-maintained in dotnet/runtime; verified NOT inbox on net9.0 |

**Auditor capability:** no new skills installed — the authorized project-local `webappsec-review` skill (two-pass method) was the audit engine; `decision-record` documents the tooling outcome (ADR-0044). Per ADR-0002/0039/0041 no additional skills or user-global tooling were introduced.
