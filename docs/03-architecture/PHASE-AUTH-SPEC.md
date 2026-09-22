# Phase Auth hardening thin (ADR-0038)

**Status:** **PROPOSED** — ADR-0038 awaiting Kevin's decision (S38-Q1–Q4). No implementation authorized.
**Product bet:** mailbox-proven accounts, then opt-in second factors, then passkeys — without changing the cookie + CSRF session posture.
**Date:** 2026-09-21
**Depends on:** ADR-0038 (PROPOSED), 0009, 0011, 0019, 0020, 0026; Phase 3.9 Gmail API HTTPS sender (candidate verification-mail transport).

---

## Mechanics (proposed — open items are questions, NOT decisions)

| ID | Sketch | Open item |
| -- | ------ | --------- |
| Q-AU-1 | S1: login gate for unverified password accounts (`RequireConfirmedEmail` or equivalent); session denied while preserving the same-401-shape discipline | Exact status/body at ACCEPTANCE — must not regress no-enumeration |
| Q-AU-2 | S1: confirm / resend / forgot / reset endpoints; tokens single-use + expiry; resend rate-limited | Exact routes/shapes/budgets at ACCEPTANCE |
| Q-AU-3 | S1: verification-mail transport — proposed reuse of the Phase 3.9 Gmail API HTTPS sender; no generic SMTP | Transport confirm at ACCEPTANCE |
| Q-AU-4 | S1: grandfather rule for pre-existing password users | S38-Q1 (blocking) |
| Q-AU-5 | S1 quick wins: HSTS non-dev; absolute session cap over the 14-day sliding window; register/first-step rate limiting | Exact values/budgets at ACCEPTANCE |
| Q-AU-6 | S1: register-409 enumeration tradeoff — documented decision (keep 409 vs generic success-shape) | Decision at ACCEPTANCE |
| Q-AU-7 | S2: TOTP enroll (QR URI) / verify / disable-with-password-recheck; recovery codes one-time + shown once | Exact endpoint shapes + storage at ACCEPTANCE |
| Q-AU-8 | S2: second-step login via `RequiresTwoFactor` + recovery-code path | Exact shapes at ACCEPTANCE |
| Q-AU-9 | S2: Google-only (passwordless) enrollment gate | S38-Q2 (blocking) |
| Q-AU-10 | S3: passkey registration/authentication ceremonies; RP ID per-env config; password+TOTP fallback | Exact .NET 9 API surface MUST be re-verified in Microsoft Learn at implementation time (binding obligation in ADR-0038) |
| Q-AU-11 | S3 + global: recovery UX when ALL methods are lost | S38-Q3 (blocking) |
| Q-AU-12 | Enforcement order | S38-Q4 (blocking) |
| Q-AU-13 | Spanish UI copy (examples in ADR-0038; exact strings at ACCEPTANCE) | Exact copy at ACCEPTANCE |
| Q-AU-14 | **OUT (firewall):** auth behavior changes in docs; generic SMTP; Event/RSVP mail; JWT/BFF; account deletion; unlink UI; mobile bearer | — |

---

## Scope

| In (thin, after ACCEPTANCE) | Out |
| --------------------------- | --- |
| S1 verification + login gate + quick wins (T-AU-01) | Any implementation before ACCEPTANCE |
| S2 TOTP + recovery codes (T-AU-02) | Generic SMTP; Event/RSVP mail |
| S3 passkeys with fallback (T-AU-03) | JWT/BFF; account deletion; unlink UI; mobile bearer |
| Unit + API matrix + Playwright denial paths per wave | Whisper · cloud LLM · Q9 · pitch · YouTube · MusicXML · scoring |

---

## Tickets (PROPOSED — no branches until ACCEPTANCE)

| ID | Work | Status |
| -- | ---- | ------ |
| **T-AU-00** | Docs: ADR-0038 PROPOSED + this spec skeleton + NOW update | IN PROGRESS (this PR, docs only) |
| **T-AU-01** | S1 implementation sketch: endpoints + gate + quick wins + tests | GATED on ACCEPTANCE + S38-Q1 (+ S38-Q4) |
| **T-AU-02** | S2 implementation sketch: TOTP + recovery codes + second step + tests | GATED on ACCEPTANCE + S38-Q2 (+ S38-Q4) |
| **T-AU-03** | S3 implementation sketch: passkeys + RP ID + fallback + tests | GATED on ACCEPTANCE + S38-Q3 (+ S38-Q4) |

Implementation branch naming: `feature/t-au-*` (one coherent vertical slice per ticket or batched only with explicit approval).

---

## Audit checklist (per wave, at implementation time)

- [ ] No-enumeration regression check: unverified/2FA/passkey denials preserve the identical-failure-shape discipline; register-409 tradeoff explicitly decided, not drifted
- [ ] Existing-users-first: grandfather answer (S38-Q1) implemented before enforcement flips; Google-only path (S38-Q2) covered; all-methods-lost recovery (S38-Q3) defined
- [ ] Cookie + CSRF posture unchanged (ADR-0011/0020): HttpOnly/Lax session, `X-CSRF-TOKEN` on unsafe methods
- [ ] No secrets in git; RP ID / mail config per-env only
- [ ] Spanish UI copy reviewed (exact strings at ACCEPTANCE)
- [ ] Unit + API matrix (verified/unverified/2FA) + Playwright denial paths green
- [ ] No Cursor co-author trailers
