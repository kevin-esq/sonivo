# PHASE-NEXTJS-PARITY-MIGRATION — Vite SPA → Next.js (parity, then retire Vite)

- **Status:** IN PROGRESS (owner-authorized 2026-10-05: "haz que se pase todo a next ... para que podamos borrar Vite").
- **ADR:** ADR-0067 (strangler).
- **Related:** `PHASE-NEXTJS-MULTITENANT-BFF-SPEC.md`, `web/README.md` (retire checklist).

## Goal

Port the entire `web/sonivo-web` Vite SPA into `web/apps/app` (`@sonivo/app`) until
feature parity, then delete `web/sonivo-web` and its build/CI/E2E wiring.

## Approach

- **Reuse, don't rewrite:** the Vite app is React 19 + TS + Tailwind 4. Components
  are ported largely unchanged; only routing and data-fetching boundaries change.
- **Routing:** replace `react-router-dom` with Next App Router routes; authenticated
  product routes become client components where interactivity requires it.
- **Providers** (`AuthProvider`, `ThemeProvider`, `ToastProvider`,
  `AudioPlayerProvider`, `RailPresenceProvider`) move to a single client provider
  tree in `apps/app`.
- **Shared code** comes from `@sonivo/{api-client,i18n,ui}`.
- **Strangler:** each wave ships behind the Next app while Vite stays live; Vite is
  deleted only when the parity checklist passes.

## Parity checklist (route inventory to port)

- **Auth/account:** `/login`, `/register`, `/confirm`, `/forgot-password`,
  `/reset-password`, `/cuenta` (profile, preferences, security incl. 2FA + passkeys,
  membership, notifications), `/security` redirects. Google OAuth.
- **Groups:** `/grupos`, `/unirse`, `/join/:token`, `/g/:slug` resolver, group
  create/rename/leave/delete, invitations.
- **Group workspace:** home dashboard, `/library`, `/songs/:id`,
  `/arrangements/:id`, `/arrangements/:id/practice`, `/setlists`,
  `/setlists/:id`, `/events`, `/events/:id` (+ RSVP), `/people`, `/calendar`,
  `/tasks` (kanban), `/roles`, `/resources`, `/files`, `/settings` (branding).
- **Practice:** ChordPro view/editor, LRC import, audio digitizer, tuner,
  metronome, stage mode, conductor (SignalR), persistent player.
- **Global:** search, activity rail, presence heartbeat, toasts, PWA manifest,
  data export.

## Waves

| Wave | Scope | Status |
|---|---|---|
| **W-A** | Foundations: design tokens, client provider tree, `AuthProvider` (session), app shell (header/nav/sidebar), route protection | IN PROGRESS |
| **W-B** | Account + auth surfaces (login/register/verify/account/security 2FA+passkeys) | TODO |
| **W-C** | Groups: list/join/invite, slug resolver, group shell | TODO |
| **W-D** | Repertoire: library, song, arrangement, resources/files | TODO |
| **W-E** | Scheduling: setlists, events, RSVP, calendar | TODO |
| **W-F** | Practice: ChordPro, LRC, digitizer, tuner, metronome, stage, conductor | TODO |
| **W-G** | Tasks/roles/people/roster, branding editor, search, polish | TODO |
| **W-H** | Parity sign-off → update Dockerfile/CI/E2E → **delete `sonivo-web`** | TODO |

Each wave: build (`turbo run build`) + relevant tests; no wave deletes Vite.

## Definition of done (do not delete Vite until all hold)

1. Every route in the inventory above works in `@sonivo/app` against the real API.
2. `Dockerfile` builds and serves `@sonivo/app`; `render.yaml`/`PublicOrigin` updated.
3. CI "Frontend build" and Playwright E2E target the Next app.
4. `sonivo-web` removed in the same PR that satisfies 1–3.

## Known risks / decisions

- **react-router → App Router** is the main coupling; ported per route, not via a
  compatibility shim, to keep the result idiomatic.
- **Subdomain tenancy** (`slug.sonvo.lat`) is applied as the group shell is ported;
  until then the app keeps path tenancy (`/g/:slug`).
- **Client-only APIs** (SignalR, WebAuthn, AudioWorklet, `WakeLock`) stay in client
  components.
