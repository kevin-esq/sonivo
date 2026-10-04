# NOW — agent focus

**Updated:** 2026-10-04

## Checkpoint state

```text
Implementation: COMPLETE — ADR-0055 group workspace redesign W-A…W-H all merged (PRs #186–#193);
  IA refinement + hidden scrollbars (PR #188); ADR-0057 live chord viewer + metronome (PR #197);
  Kanban Trello/Planner style + all error fixes (PR #200)
Human approval: APPROVED (owner 2026-10-03: ADR-0055 + IA refinement + hidden scrollbars + ADR-0057)
Git checkpoint: COMMITTED — develop at 9c6f8bc (PR #200 merge)
Remote: PUSHED · all PRs merged to develop
CI: PASSING — every wave green (Backend, Frontend, Playwright E2E, CodeQL, SCA)
```

**Phase:** Group workspace redesign · **ADR-0055** CLOSED (PRs #186–#193). **ADR-0057** (live chord viewer + metronome) CLOSED (PR #197). IA refinement + hidden scrollbars (PR #188). Kanban Trello/Planner style + all error fixes (PR #200).

### Delivered this session
- **W-C** group calendar (`GroupCalendarPage`) — group-scoped, no cross-group leak.
- **W-D** Recursos library — aggregated `GET /api/groups/{id}/resources` + categories + upload modal.
- **W-E** presence (`ApplicationUser.LastSeenAt` + `POST /api/presence/heartbeat`) + Members redesign (role tabs, email, status).
- **W-G** `Task` entity + CRUD API + UI.
- **W-H** i18n es/en parity, a11y, E2E per wave, Playwright MCP visual pass, docs.
- **IA refinement** — sidebar Inicio·Música·Organización·Equipo·Recursos; `.no-scrollbar`.
- **ADR-0057** — live chord viewer (transpose + autoscroll + metronome) in Practice.
- **Kanban Trello/Planner** — all error fixes + manual ordering (Position field) + memoization + optimistic updates.

### Remaining (not started — see final report)
- WL v4 (color wheel/palette, live preview, banner/group-name editing)
- Setlist generator / Service sheets
- RSVP + Musician call sheet
- Multitrack mini mixer

### Operational notes (local E2E runner)
- Serve the E2E SPA with `npm run preview` (static `dist/`), **not** `npm run dev`; run `npm run build` first.
- API: `dotnet run --project src/Sonivo.Api --launch-profile http` with `$env:Auth__EnableTestHook="true"` on `:5171`; PostgreSQL on `:5433`. Apply new migrations with `$env:SONIVO_MIGRATE_ON_START="true"`.
- CI browses via `http://localhost:5173` (WebAuthn trustworthy origin) — keep when changing E2E.
