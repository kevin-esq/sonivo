# Phase Auth hardening thin (ADR-0038)

**Status:** **COMPLETE** — S1 merged (PR #97), S2 merged (PR #98), S3 passkeys merged with E2E (TC-PK-01 + CI virtual-authenticator fix).
**Product bet:** mailbox-proven accounts, then opt-in second factors, then passkeys — without changing the cookie + CSRF session posture.
**Date:** 2026-09-21
**Depends on:** ADR-0038 (ACCEPTED), 0009, 0011, 0019, 0020, 0026; Phase 3.9 Gmail API HTTPS sender (verification-mail transport).

---

## Mechanics (proposed — open items are questions, NOT decisions)

| ID | Decided mechanics (binding for S1; S2/S3 sketches stay open) |
| -- | ------------------------------------------------------------ |
| Q-AU-1 | S1 login gate for unverified password accounts via `RequireConfirmedEmail`; denied session keeps the identical-401 shape AND carries the Spanish unconfirmed copy + resend affordance (no new oracle: resend endpoint always 202). |
| Q-AU-2 | S1 endpoints: `POST /api/auth/confirm-email {email, token}` (single-use, expiring tokens), `POST /api/auth/resend-confirmation {email}` (always 202 + per-email cooldown), `POST /api/auth/forgot-password {email}` (always 202), `POST /api/auth/reset-password {email, token, newPassword}`. Fixed-window rate limits on register + these four (modest budgets at implementation). |
| Q-AU-3 | Transport: reuse Phase 3.9 Gmail API HTTPS sender, best-effort + warning (existing pattern); confirm link carries `{email, token}` to an SPA route. NO generic SMTP. |
| Q-AU-4 | Grandfather: forced-verify-on-next-login (S38-Q1 decided). Live sessions are never invalidated: gate applies at sign-in only; SPA RequireAuth checks session presence only. |
| Q-AU-5 | Quick wins in S1: HSTS non-dev; rate limits (above); absolute session cap DEFERRED (documented); register-409 KEPT. |
| Q-AU-6 | Register-409 tradeoff: kept (existing clients + E2E rely on it; accepted low risk). |
| Q-AU-7 | S2: open until S2 wave (recorded answers bind: explicit-accept Google-only enrollment). |
| Q-AU-8 | S2: open until S2 wave. |
| Q-AU-9 | S2: open until S2 wave. |
| Q-AU-10 | S3: open until S3 wave (binding obligation stands: verify .NET 9 passkey surface in Learn at implementation time; RP ID per-env; fallback kept). |
| Q-AU-11 | S3: open until S3 wave (manual support for lost-all, no code). |
| Q-AU-12 | Order: sequential S1 → S2 → S3 (S38-Q4 decided). |
| Q-AU-13 | Spanish UI copy (binding): “Confirma tu correo”, “Te enviamos un enlace de confirmación”, “Reenviar correo”, “Tu cuenta aún no está verificada — revisa tu bandeja o reenvía el correo”, “Restablecer contraseña”, “Enlace expirado o inválido — solicita uno nuevo”. |
| Q-AU-14 | **OUT (firewall):** S2/S3 implementation in S1; generic SMTP; Event/RSVP mail; JWT/BFF; account deletion; unlink UI; mobile bearer; absolute session cap; register-shape change; Whisper · cloud LLM · Q9 · pitch · YouTube · MusicXML · scoring |

---

## Mail transport note — Gmail SendAs alias requirement (S1 follow-up)

- **FACT:** Gmail silently rewrites the `From` header to the OAuth account unless `Gmail:From` is a **verified SendAs alias** on that account with an **exact address match** (`Name <addr>` display form is fine — the address inside must match exactly).
- **Guard:** at startup, when the Gmail sender is configured but `Gmail:From` is not a valid `addr@domain` shape, the API logs a **HIGH-severity warning** naming this requirement. The check never throws (best-effort posture stays); successful sends are unchanged.
- **Operator action:** if the warning surfaces (or recipients see the wrong sender), add the address under the Gmail account's *Settings → Accounts → Send mail as* and set `Gmail:From` to that exact address.
- **2026-09-29 finding (verified in the live mailbox):** the sending account exposes exactly ONE SendAs identity — itself (personal account, default, no other aliases, none unverified). The sender rewrite is therefore unavoidable without a new alias; accepted posture: keep the personal sender and document it here. Revisit only with a dedicated mailbox + verified alias (Kevin's call).

---

## Scope

| In (thin, after ACCEPTANCE) | Out |
| --------------------------- | --- |
| S1 verification + login gate + quick wins (T-AU-01) | Any implementation before ACCEPTANCE |
| S2 TOTP + recovery codes (T-AU-02) | Generic SMTP; Event/RSVP mail |
| S3 passkeys with fallback (T-AU-03) | JWT/BFF; account deletion; unlink UI; mobile bearer |
| Unit + API matrix + Playwright denial paths per wave | Whisper · cloud LLM · Q9 · pitch · YouTube · MusicXML · scoring |

---

## Tickets (all shipped)

| ID | Work | Status |
| -- | ---- | ------ |
| **T-AU-00** | Docs: ADR-0038 PROPOSED + this spec skeleton + NOW update | MERGED (PR #96) |
| **T-AU-01** | S1: verification endpoints + login gate + HSTS + rate limits + tests | MERGED (PR #97) |
| **T-AU-02** | S2: TOTP + recovery codes + second step + tests | MERGED (PR #98) |
| **T-AU-03** | S3: passkeys + RP ID + fallback + tests | MERGED (passkeys E2E + CI fix) |

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
