# Phase UI/UX redesign (ADR-0043)

**Status:** **SHIPPED / CLOSED 2026-09-30** — ADR-0043 **ACCEPTED** (owner-authorized redesign, es-default es/en, Grupo/Cuenta IA, strangler waves W0–W5).
**Product bet:** an organized group gets one place where "what's next and is it ready?" is answerable at a glance — immersive identity for the group, disciplined operate surfaces for the work.
**Date:** 2026-09-29 · **Closed:** 2026-09-30
**Depends on:** ADR-0043 (ACCEPTED), 0006, 0009–0012, 0019–0020, 0031–0032, 0035, 0036, 0037, 0042.

---

## Scope

| In (shipped) | Out (firewall) |
| ------------ | -------------- |
| Visual redesign of the existing web app; IA split Grupo vs Cuenta | Native app (Q11 FUTURE); PWA install scope |
| Frontend-only es/en i18n (es default, persisted) | Backend strings, validation messages, mails (phase 2) |
| Per-group accent/cover identity, Owner-only edit, device-local | Server-side branding storage; per-song themes |
| Practice progressive disclosure (Estudiar / Avanzado / Afinar) | Scoring / karaoke UX (ADR-0037 OUT); cloud LLM (ADR-0033) |
| Client-side route code-splitting + error boundary | Backend/AuthZ/session changes; blob, 5 MiB cap, payments |

---

## Waves (strangler, each merged only on green CI)

| Wave | Deliverable | PR | E2E added |
| ---- | ----------- | -- | --------- |
| **W0** | ADR-0043 + root `PRODUCT.md`/`DESIGN.md`, light/dark tokens, i18n scaffold, `ThemeProvider`/`LanguageProvider` | #115 | — (existing 35 kept green) |
| **W1** | Grupo vs Cuenta shell split, immersive group header, `/cuenta` sections, `/settings/*` redirects, ajustes grupo | #116 | `w1-shell.spec.ts` (4) |
| **W2** | Listas immersive: hero, search, readiness chips, Song→Arrangement→Resources disclosure | #117 | `w2-listas.spec.ts` (3) |
| **W3** | Practice progressive tabs (`?tab=estudiar\|avanzado\|afinar`) | #118 | `w3-practice.spec.ts` (1) |
| **W4** | Scheduling operate tables: heroes, status chips, empty states | #119 | `w4-scheduling.spec.ts` (3) |
| **W5** | Full frontend i18n sweep, a11y/hygiene, integrated structural hardening, this spec | *(this PR)* | full suite green |

Local E2E baseline at close: **46/46** on the real React → API → Identity cookie → PostgreSQL path (dev-path R2 blob backend).

---

## IA map

| Area | Routes | Chrome |
| ---- | ------ | ------ |
| **Grupo** | `/groups/:id` (inicio), `library`, `setlists`, `setlists/:setlistId`, `events`, `events/:eventId`, `people`, `songs/:songId`, `arrangements/:arrangementId`, `arrangements/:arrangementId/practice`, `ajustes` | `GroupWorkspace` — immersive accent-washed header, desktop rail, mobile bottom tabs |
| **Cuenta** | `/cuenta` (perfil), `preferencias`, `seguridad`, `grupos` | `UserChrome` — brand header + account tab bar |
| **Mis grupos** | `/` | `GroupsChrome` |
| **Auth** | `/login`, `/register`, `/confirm`, `/forgot-password`, `/reset-password`, `/join/:token` | guest / public chrome |
| **Redirects (legacy)** | `/security` → `/cuenta/seguridad`; `/settings` → `/cuenta`; `/settings/profile` → `/cuenta`; `/settings/security` → `/cuenta/seguridad`; `/settings/team` → `/cuenta/grupos` | — |

---

## Contracts

- **i18n:** `es` is the default and **never auto-switches** on `navigator.language` (explicit user choice only, persisted at `sonivo:lang`); `en` is a full translation; all frontend copy goes through `t()`. Spanish copy is byte-identical to pre-redesign strings asserted by E2E.
- **Theme:** `data-theme="light|dark"` on `documentElement`, persisted at `sonivo:theme`, **dark default** (matches pre-redesign look); `prefers-reduced-motion` collapses motion.
- **Group identity:** accent + cover stored device-locally at `sonivo:group-accent:<groupId>`; default accent `#8366f1`; Owner-only mutate, Member read-only. Server-side branding is FUTURE.
- **Player:** audio lives in `AudioPlayerContext`; `PersistentGlobalPlayer` mounts **only with an active session** and the track is closed on logout.
- **Auth returns:** unauthenticated deep links redirect to `/login?next=<path>` and only internal same-origin paths are honoured (`safeNextPath`); `/login` and `/register` are never return targets.
- **Resilience:** a route-level error boundary replaces the tree with a recoverable reload prompt; route chunks load lazily under `Suspense`.

---

## History note — integrated work beyond the original wave plan

Owner decision (2026-09-30): a structural hardening pass authored in a parallel session was **kept and integrated** rather than reverted. It adds client-side route code-splitting, the error boundary, `/login?next=` return handling with `safeNextPath`, and authenticated-player gating. Auditor fixes applied during integration:

1. `AuthenticatedPlayer` called a non-existent `stop()` (silently a no-op through a cast) — corrected to the real `closeTrack()`, so audio actually stops on logout.
2. The i18n restyle had rewritten the resend-confirmation copy, breaking `auth.spec.ts` — restored to the contract copy (`Te enviamos un enlace de confirmación`).

Rejected at audit: rewriting E2E specs to match a gratuitous copy change.

---

## Known limitations (explicit, not silent)

- **Practice default tab keeps the full surface.** `TC-Q9-01` (conductor visible) and `TC-PITCH-01` (tuner visible) assert those panels on the default view, so Estudiar shows them and Avanzado/Afinar provide the progressive access. Truly slimming the default requires changing those specs' contract — deliberately not done.
- **W3 "Avanzado" timing link** points at the arrangement edit surface because `ChordTimingEditor` holds draft state inside `ArrangementEditForm`; moving it verbatim would have duplicated ids/state.
- **`{" "}`-style nested-paragraph console warning** may still surface from dialog copy in Arrangement detail; queued as cosmetic hygiene, no behavioural impact.
- **Backend i18n is phase 2** — API error strings remain English by design.

---

## Testing

- Pyramid unchanged: .NET unit/integration/API + Playwright critical journeys (`e2e/`).
- New wave specs exercise the redesign through the real stack (no mocks); all pre-existing `TC-*` suites stayed green at every wave.
- Redesign-specific coverage: shell split + redirects, theme persistence, language switch, search/readiness, practice tabs, scheduling chips.
