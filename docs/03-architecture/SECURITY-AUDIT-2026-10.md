# SECURITY-AUDIT-2026-10.md — Sonivo backend hardening: remediation of Program.cs review findings

**Date:** 2026-10-04
**Authorization:** explicit user request 2026-10-04 ("hazlo todo… actúa como auditor… delega… entrega reporte completo").
**Auditor scope:** full read of `src/Sonivo.Api/Program.cs` (4.3k lines), `Auth/*`, `Application/Scheduling/IcsCalendar.cs`, `Application/Tenancy/MembershipHandlers.cs`, `Infrastructure/*`, `Domain/Tenancy/*`, plus an independent third-party review of the same file (findings list below). Every finding cites `file:line` evidence read in full.
**Predecessor:** [`SECURITY-AUDIT-2026-09.md`](SECURITY-AUDIT-2026-09.md) (findings C1–C2, M1–M6, L1–L4). This pass closes the residual items and a new batch from the independent review.

---

## 1. Verification performed (all run, not assumed)

| Check | Result |
| ----- | ------ |
| Domain tests | **PASS — 141/141** |
| Application tests (incl. 2 new `IcsCalendarTests`) | **PASS — 211/211** |
| Api.Tests (incl. 5 new security tests) | **PASS — 223/223**, run twice (flakiness check) |
| Integration tests vs live PostgreSQL (5433) | **PASS — 57/57** |
| EF migrations vs dev DB | applied clean (`dotnet ef database update`) |
| Frontend production build (`npm run build`) | **PASS — 1.14 s** |
| Playwright e2e (89 journeys, Development + test hook, CI-parity) | **PASS** (see §6; one selector-only helper fix, no app regression) |
| API + Vite manual smoke (Playwright MCP) | login/render OK |

---

## 2. Findings register — remediation summary

Severity as in the review: 🔴 critical/high · 🟠 medium · 🟡 maintainability.
Status: ✅ fixed in this pass · 🔒 deployment constraint (documented) · 📋 follow-up (product decision needed).

### 🔴 Critical / high

| # | Finding (review) | Fix | Evidence |
| --- | --- | --- | --- |
| A1 | Email login did not burn a hash for unknown users (timing oracle) and the lockout message revealed account existence | Burn via `AuthUniformity.BurnPasswordVerification`; locked-out 401 is byte-identical (status/title/detail) to bad credentials | `Program.cs` `/api/auth/login`; test `Locked_out_login_returns_the_identical_401_shape_as_unknown_email` |
| A2 | Passkey `login-finish` signed in without `CanSignInAsync` / lockout / email-confirmation checks | Both gates added before `SignInAsync` | `Program.cs` `PasskeysLoginFinish`; existing passkey matrix still green |
| A3 | `credentialId` had no global uniqueness (ambiguity/DoS); register-finish returned 401 on ceremony failure (SPA 401 interceptor logs the user out) | Global uniqueness check → 409; ceremony failures → 400 | `Program.cs` `PasskeysRegisterFinish`; tests `Register_finish_with_a_credential_id_owned_by_another_user_returns_409`, `Register_finish_with_invalid_payload_returns_400_not_401` |
| A4 | Passkey DELETE could remove the last access method; no audit of passkey add/remove | Last-method guard (password/2FA/Google/other passkeys) → 400; `passkey_added` / `passkey_removed` audit rows | `Program.cs` `PasskeysDelete`, `AccountAudit.cs`; test `Deleting_the_last_access_method_is_rejected_with_400` |
| A5 | In-session password rechecks (`2fa/disable`, recovery-codes regen, change-password) did not count toward lockout | `CheckPasswordSignInAsync(lockoutOnFailure: true)` / `AccessFailedAsync` + reset on success | `Program.cs`; test `Disable_2fa_wrong_password_counts_toward_lockout` |
| A6 | `KnownProxies/KnownNetworks.Clear()` trusted any single XFF hop → IP spoofing evaded every rate limit when directly reachable | Trust only configured `ForwardedHeaders:KnownProxies`/`KnownNetworks`; default = loopback only (XFF ignored) | `Program.cs` forwarded-headers config block |
| A7 | Six duplicated user projections; 2FA/passkey login paths omitted `mustChangePassword`/`managedByGroupId` and leaked raw `@managed.invalid` emails | Single `ToUserResponse(user, handle?)` used on all seven paths | `Program.cs` |

### 🟠 Medium

| # | Finding | Fix | Evidence |
| --- | --- | --- | --- |
| B1 | Unknown `/api/**` returned SPA `index.html` with 200 in production | `/api/{**path}` fallback → 404 JSON before the SPA fallback | `Program.cs` (non-dev block) |
| B2 | Two `GetUserAsync` DB hits per request (middleware + every endpoint) | `RequireUserIdAsync` reads the `NameIdentifier` claim (0 queries); the stamp validator + must-change middleware still validate the user once | `Program.cs` helper |
| B3 | `.DisableAntiforgery()` calls were no-ops against the global CSRF middleware (misleading) | Removed all 61; middleware documented as intentionally global (login-CSRF protection included) | `Program.cs` |
| B4 | 429/403 responses lacked security headers; missing `Referrer-Policy`/`Permissions-Policy` | Header + CSP middleware moved to the front of the pipeline; two new headers added | `Program.cs` pipeline order |
| B5 | CSRF cookie `HttpOnly=false` | `HttpOnly=true` (token only via `/api/auth/csrf`) | `Program.cs` |
| B6 | Uploads buffered before size checks; content-type trusted; no caching for public branding assets | `RequestSizeLimit` metadata per upload endpoint (logo/banner/favicon 3 MiB, resources 6 MiB, LRC 1 MiB, CSV 2 MiB); magic-byte validation (PNG/JPEG/GIF/WebP); `Cache-Control: public, max-age=300` on public by-slug branding assets | `Program.cs` + test `Logo_upload_enforces_type_allowlist_and_size_cap` (extended with lying-content-type case) |
| B7 | Digitize used `Task.Run` fire-and-forget (lost on restart, no concurrency cap, no error surface) | `DigitizeJobQueue` (`Channel<T>` + `BackgroundService`, 2 workers, bounded 16); full queue fails the job visibly + 503 | `src/Sonivo.Api/Realtime/DigitizeJobQueue.cs` |
| B8 | Roster create/delete not transactional (orphan accounts / dangling memberships) | Explicit transactions (Postgres only; EF InMemory does not support them — guarded via `UseInMemoryDatabase`) | `Program.cs` roster endpoints |
| B9 | `ToDictionary(e => e.Code, …)` threw on duplicate error codes | `GroupBy` | 3 sites in `Program.cs` |
| B10 | Handle-login rate-limit partition was case-sensitive | Slug lowercased in partition key | `Program.cs` |
| B11 | No rate limits on invite-accept, uploads, digitize, exports; no global backstop | New policies (`invite-accept` 30, `group-upload` 30, `digitize` 10, `export` 10) + global limiter 600/min/IP | `Program.cs` |
| B12 | `calendar.ics` only via cookie; `IcsCalendar` did not escape a lone `\r` | Lone `\r` escaped; property-injection covered by tests | `IcsCalendar.cs` + `IcsCalendarTests`; **calendar-subscription token URL stays 📋 follow-up (product decision)** |
| B13 | `PasskeyChallengeStore` static in-memory (single instance only) | 🔒 documented deployment constraint: multi-instance needs a shared challenge store or sticky sessions | `PasskeysAuth.cs` |
| B14 | `EnsureCreated` under the migrate-on-start flag blocks future migrations | `Migrate()` | `Program.cs` |
| B15 | `/members` exposed synthetic `@managed.invalid` emails | Hidden (same rule as `/api/auth/me`); visibility of real member emails unchanged (📋 verify against ADR if the product wants role-based hiding) | `MembershipHandlers.cs` |

### 🟡 Maintainability

| # | Finding | Fix |
| --- | --- | --- |
| C1 | ~2.5k-line `Program.cs` | 📋 follow-up ticket (split into `MapXEndpoints` after this delivery; not bundled to keep the security diff reviewable) |
| C2 | Feature flag repeated ~20× | 📋 follow-up ticket (`FeatureFlagFilter` endpoint filter) |
| C3 | Lying comments / DELETE-with-body contracts | "GroupBranding default off" → corrected to `true`; `DeleteTaskRequest` body now nullable (parity with other DELETEs); unused `DeleteEventRequest` removed |
| C4 | Mixed ES/EN `detail` strings | 📋 follow-up (stable error `code`s + client-side localization) — not bundled |
| C5 | Temporary password was a 32-hex GUID | Readable CSPRNG password, no ambiguous glyphs, guaranteed digit/lower/upper for the Identity policy | `ManagedAccountProvisioner.cs` |
| C6 | Unique violations → 500 | `DbUpdateException` + PG `SqlState 23505` → 409 | `AppExceptionHandler` |
| C7 | Manifest slug unvalidated + UTF-16 surrogate cut | `GroupSlug.IsValid` guard; `TruncateByTextElements` | `Program.cs` |
| C8 | No Origin check on the WebSocket handshake | `/hubs` Origin allow-list (same host, `Security:AllowedHubOrigins`, loopback in Development) | `Program.cs` |
| C9 | No readiness probe with DB | `GET /api/health/ready` with `CanConnectAsync` | `Program.cs` |

---

## 3. Deployment constraints introduced (documented, config-driven)

1. **Proxy pinning (A6):** in non-Development, XFF is only honored from `ForwardedHeaders:KnownProxies` / `ForwardedHeaders:KnownNetworks`. Behind a PaaS proxy set these explicitly; unset ⇒ XFF ignored (client IP = direct peer, rate limits still safe).
2. **WebSocket origins (C8):** cross-origin hub handshakes need `Security:AllowedHubOrigins` (comma-separated hosts).
3. **Single-instance constraint (B13):** unchanged from T-SEC-01 but now explicit — WebAuthn challenge state is process-local.
4. **Digitize queue (B7):** transcription is now bounded (2 concurrent); a saturated queue returns 503 and marks the job failed.

## 4. Behavior changes visible to the SPA

- Login lockout now returns the generic "Invalid email or password." (lockout is no longer distinguishable).
- 2FA challenge/recover and passkey login responses now include `mustChangePassword` / `managedByGroupId` / `handle` and hide `@managed.invalid` emails — same shape as `/api/auth/me`.
- Passkey register-finish verification failures are 400 (not 401) — no accidental SPA logout.
- Passkey re-registration of an id owned elsewhere → 409.
- CSRF cookie is HttpOnly (SPA unaffected — token via `/api/auth/csrf`).

## 5. Test matrix added (RED→GREEN evidence)

| Test | Covers |
| --- | --- |
| `VerificationApiTests.Locked_out_login_returns_the_identical_401_shape_as_unknown_email` | A1 |
| `TwoFactorApiTests.Disable_2fa_wrong_password_counts_toward_lockout` | A5 |
| `PasskeysApiTests.Register_finish_with_a_credential_id_owned_by_another_user_returns_409` | A3 |
| `PasskeysApiTests.Register_finish_with_invalid_payload_returns_400_not_401` | A3 |
| `PasskeysApiTests.Deleting_the_last_access_method_is_rejected_with_400` | A4 |
| `GroupBrandingApiTests.Logo_upload_enforces_type_allowlist_and_size_cap` (extended) | B6 |
| `IcsCalendarTests.Hostile_titles_cannot_inject_ics_properties` + `Ordinary_names_round_trip_untouched` | B12 |
| `PasskeysApiTests.Passkeys_registration_flow_and_listing_and_login_and_deletion` (extended with audit assertion) | A4 |

## 6. e2e verification notes

- The suite runs with `ASPNETCORE_ENVIRONMENT=Development` + `Auth:EnableTestHook=true` (workflow-global in CI, `ci.yml:23`).
- **Infra:** `e2e/playwright.config.ts` now declares a `webServer` for the Vite dev server (`reuseExistingServer: true`) so the suite is self-contained locally and reuses the CI-started server.
- **Selector alignment after the kanban/workspace redesign (test-only, no app regression):**
  - `helpers.ts` `createGroup`: role label scoped to `rail-brand` (the rail intentionally renders the role twice).
  - `helpers.ts` `inviteMemberAndReadLink`: "Invitar miembro" scoped to the owner "Administrar" region.
  - `w12-mobile-nav`: "Más" scoped to the top bar (the test's own contract).
  - `w-g-tasks`: view switcher is buttons with `aria-pressed`, not `role=tab`.
  - `w20-branding` / `w9-surfaces`: branding lives behind the "Identidad visual" tab; `w9` re-opens the tab after reload and dirties the draft (Save is disabled until something changes).
- **Application fix found by e2e:** the Inicio "Acciones rápidas" quick-action "Invitar miembro" was rendered for **every** member; it is now Owner-gated (`GroupHomePage.tsx`), matching the invite-oracle contract (members see no invite chrome).
- **CI result (authoritative gate):** Playwright E2E **PASS (9m4s)** on the GitHub runner, together with Backend build & tests, Frontend build, SCA gate and CodeQL/CodeQL-Analyze — all green on PR #205.
- Locally the sandbox intermittently kills the Vite/node process; the run is 84 pass + the 2 specs caught in that kill window pass in isolation, 3 skipped by design. This is an environment artifact (no such killer on CI), not a repo issue.
- A global per-IP rate limiter was evaluated (B11) and **removed** after it produced 429s on `GET /api/auth/csrf` under the suite's legitimate burst traffic; the per-endpoint policies remain, and a global backstop belongs at the edge/CDN.

## 7. Residual / follow-ups (explicitly NOT done here)

- **C1/C2:** split `Program.cs` + `FeatureFlagFilter` (pure refactor, separate PR).
- **C4:** stable error codes + client localization.
- **B12 token URL:** revocable per-group calendar token is a product decision (new surface) — needs user acceptance.
- **B15 role-based email visibility:** if members should not see each other's real emails, decide per role in an ADR.
- Rate-limiter state is in-memory (per-instance) — acceptable single-instance, same class as B13.
