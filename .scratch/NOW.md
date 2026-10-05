# NOW - agent focus

**Updated:** 2026-10-04

## Checkpoint state

```text
Implementation: COMPLETE - SECURITY-AUDIT-2026-10 hardening (A1-A7, B1-B15, C3, C5-C9)
  Branch: feature/group-workspace-redesign → MERGED to develop via PR #205 (55903c4)
  Backend: Program.cs + Auth/* + Application/* + Domain/Tenancy/AccountAudit.cs
  New files: src/Sonivo.Api/Realtime/DigitizeJobQueue.cs, tests/Sonivo.Application.Tests/IcsCalendarTests.cs
  Tests added: 7 (lockout uniformity, 2FA disable lockout, passkey 409/400/last-method,
                magic bytes, ICS escaping x2, passkey audit)
Human approval: APPROVED (user 2026-10-04)
Git checkpoint: COMMITTED (3 commits: 89297db, 7a9d681, 7527423)
Remote: PUSHED
CI: PASSING (PR #205: Backend, Frontend, SCA, CodeQL, Playwright E2E 9m4s)
Open PRs: NONE (#204 merged, #205 merged)
```

**Phase:** SECURITY-AUDIT-2026-10 (hardening pass) — report in `docs/03-architecture/SECURITY-AUDIT-2026-10.md`

### Delivered this session
- A1 login uniformity (hash burn + identical lockout 401) · A2 passkey login account gates
- A3 passkey credentialId global uniqueness + 400 (no SPA logout) · A4 last-access-method guard + audit
- A5 in-session password rechecks count toward lockout · A6 proxy pinning (config-driven)
- A7 single ToUserResponse (7 paths, hides @managed.invalid, uniform flags)
- B1 /api 404 fallback · B2 claim-based user id (no double fetch) · B3 removed 61 no-op DisableAntiforgery
- B4 headers first + Referrer/Permissions-Policy · B5 CSRF cookie HttpOnly · B6 upload limits + magic bytes
- B7 DigitizeJobQueue (bounded, durable error surface) · B8 roster transactions · B9 GroupBy
- B10 slug partition lowercase · B11 new rate limits + global 600/min · B12 ICS \r escape
- B13 documented single-instance challenge store · B14 Migrate() · B15 /members hides managed emails
- C3 comment/contract fixes · C5 readable temp password · C6 unique→409 · C7 manifest guards
- C8 hub Origin check · C9 /api/health/ready
- e2e helpers.ts strict-mode fix (selector-only, no app regression)
- Tests: Domain 141 · Application 211 · Api 223 · Integration 57 · e2e 89 journeys (final run pending)

### Follow-ups (NOT bundled — see audit report §7)
- C1/C2: split Program.cs + FeatureFlagFilter (separate PR)
- C4: stable error codes + client i18n
- B12 token URL + B15 role-based email visibility: product decisions needed
