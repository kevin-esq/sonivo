# Phase Q9 realtime thin (ADR-0036)

**Status:** **ACCEPTED — FROZEN 2026-09-20 (HUMAN-DELEGATED)** — ADR-0036 ACCEPTED with Q9-Q1–Q5 resolved below. Mechanics are decided; tickets T-Q9-01–03 are ACTIVE.
**Product bet:** One Owner conducts (“we are here”) and Members' Practice views follow — throttled position broadcast over self-hosted SignalR, no audio transport, no vendor.
**Date:** 2026-09-20
**Depends on:** ADR-0036 (ACCEPTED), 0009, 0011, 0012, 0016, 0018, 0019, 0020, 0027, 0029, 0031.

---

## Mechanics (decided — binding)

| ID | Decision |
| -- | -------- |
| Q-Q9-1 | Self-hosted SignalR Hub in-process (same deployable). NO Azure SignalR — vendor/cost ban. No backplane/sticky single-instance in thin (documented limitation). |
| Q-Q9-2 | Room: single Event room `event-{id}`. `JoinRoom` / `LeaveRoom`; server-pushed presence list. |
| Q-Q9-3 | Conductor message: Owner-only `BroadcastPosition({arrangementId, positionMs, playing})`, **1 Hz** (Q9-Q1: client sends at most 1 Hz; server enforces minimum 900 ms gap per connection, drops faster messages silently with debug log). Members receive-only. **Any Owner present may broadcast — last-writer-wins** (Q9-Q2: no election). |
| Q-Q9-4 | AuthZ: `[Authorize]` + per-method Membership recheck (404 non-member/unknown, 403 member non-Owner for conduct, per ADR-0019). **`X-CSRF-TOKEN` header REQUIRED on `/negotiate` POST** (Q9-Q3: same antiforgery as API unsafe methods; GET hub traffic needs none beyond cookie). |
| Q-Q9-5 | Resilience: sleep drops sockets + client auto-reconnect; `Context.User` cached at connect, Membership re-validated per method; Spanish copy (Q9-Q4): follow toggle **“Seguir al director”**, live badge **“En vivo”**, reconnecting **“Reconectando…”**; follow preference persisted per event in `localStorage`. Room caps (Q9-Q5): **50 connections max per event-room**; join over cap → clear Spanish error; presence list capped likewise. |
| Q-Q9-6 | Practice integration: received position moves the local playhead/follow-along highlight (reuse `activeChordLineBlock` path); local file audio keeps playing per device (no audio transport, no clock sync). |
| Q-Q9-7 | Testability: Hub logic behind a thin testable seam where practical; API-style tests for AuthZ matrix (404/403); E2E asserts mechanics (conduct → follow moves), not timing precision. |
| Q-Q9-8 | Spanish UI (“Seguir al director”, “En vivo”, “Reconectando…” — decided). |
| Q-Q9-9 | **OUT (firewall):** Azure SignalR / hosted realtime, audio streaming, beat-clock, chat, multi-conductor, recording, backplane/sticky, Whisper, cloud LLM, pitch, YouTube, S3, 5 MiB raise, MusicXML, Event/RSVP mail. |

---

## Scope

| In (thin, after ACCEPTANCE) | Out |
| --------------------------- | --- |
| SignalR Hub + `event-{id}` room + presence (T-Q9-01) | Hosted realtime vendor / backplane |
| Owner conduct + Member follow UX, Spanish (T-Q9-02) | Audio transport / beat-clock / chat / recording |
| AuthZ tests + sparse Playwright conductor mechanics (T-Q9-03) | Multi-conductor, room caps beyond Q9-Q5 answer |

---

## Tickets (ACTIVE — implementation authorized on `feature/t-q9-conductor`)

| ID | Work | Status |
| -- | ---- | ------ |
| **T-Q9-00** | Docs: ADR-0036 ACCEPTED + this spec frozen | DONE (this branch, docs commit) |
| **T-Q9-01** | Server: Hub + room + presence + throttled broadcast + AuthZ matrix + tests | ACTIVE |
| **T-Q9-02** | Web: conductor/follow UX (join, follow toggle, reconnect copy; Spanish) | ACTIVE |
| **T-Q9-03** | Tests: AuthZ matrix + sparse Playwright conductor mechanics + suite green | ACTIVE |

Implementation branch naming: `feature/t-q9-*` (one coherent vertical slice per ticket or batched only with explicit approval).

---

## API / persistence notes (proposed, binding only after ACCEPTANCE)

- No migration in thin: rooms/presence are ephemeral (in-memory); no new tables.
- No Event model change; `event-{id}` is a room key, not a new aggregate.
- AuthZ: cookie session per ADR-0009/0011; per-method Membership recheck per ADR-0019; `X-CSRF-TOKEN` required on `/negotiate` POST (Q9-Q3 — enforced by the existing global unsafe-method antiforgery middleware, which runs before the Hub endpoint).
- Single `@microsoft/signalr` npm dependency (pinned) for the web client — the only new dependency authorized by ADR-0036 (SignalR server is part of the ASP.NET Core shared framework).

---

## Audit checklist (each implementation PR, after ACCEPTANCE)

- [ ] No hosted realtime vendor / backplane
- [ ] No audio streaming / beat-clock / chat / multi-conductor / recording
- [ ] Per-method Membership recheck (404/403 per ADR-0019)
- [ ] Single-instance limitation documented
- [ ] Spanish copy
- [ ] Named Playwright TC when T-Q9-03 ships + suite green
- [ ] No Cursor co-author trailers
