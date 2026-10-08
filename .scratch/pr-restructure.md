## Summary

Front-end restructure + de-Spanglish + group shell redesign, as one coherent slice.

- **i18n split + Portuguese**: `i18n/index.tsx` (118 KB monolith) → one file per locale (`i18n/locales/{es,en,pt}.ts`) + a thin provider + `keys.ts`. Added a complete Brazilian Portuguese locale (1229 keys, es=en=pt parity); the language picker now offers **es / en / pt**.
- **API split**: `api/client.ts` (1309 lines, 152 exports) → a thin barrel + `api/http.ts` (single HTTP/CSRF seam) + per-domain modules (`auth`, `groups`, `members`, `songs`, `resources`, `setlists`, `events`, `tasks`, `activity`, `features`, `presence`, `handoff`, `health`). No importer changed.
- **Spanglish sweep** (language rule): Spanish comments translated to English and hardcoded UI copy routed through `t()` (new keys added to es/en/pt). Rule codified in `AGENTS.md` (*Language policy*) and a new project-local skill `.agents/skills/frontend-architecture/`.
- **Group shell redesign** (owner reference): top bar with group search + context rail (Semana / Hoy / Listas / Tu progreso) + a new group home (welcome hero, quick-action cards, upcoming events). Profile de-duplicated (removed the sidebar account card; it lives in the top bar). Banner moved into the content column so it aligns with the card.
- **Fixes**: extra document scroll eliminated (the workspace is now a fixed full-viewport app frame, only the inner content scrolls); themed scrollbars + `color-scheme` in `app/globals.css` (the active stylesheet) so no bright native scrollbar in dark.
- **E2E**: create helpers hardened (the custom `GroupSelect` step is part of the retried unit); specs updated for the new role presentation and the restored short player labels.

## Scope

- In scope: `web/apps/app/src/**`, `web/apps/app/app/globals.css`, `e2e/tests/*`, `AGENTS.md`, `docs/tooling/SKILLS-INVENTORY.md`, `.agents/skills/frontend-architecture/`.
- Explicitly out of scope (follow-ups): splitting the remaining large pages into feature folders (`GroupSettingsPage`, `GroupsPage`, `GroupTasksPage`, `ArrangementDetailPage`, `PracticePage`, `EventDetailPage`, `GroupWorkspace`); **English back-end messages** — still Spanish and ~49 E2E assertions depend on them; that needs error codes + client-side mapping (the UI must stop rendering raw back-end text) and its own review.

## Tests run

- [x] Frontend type-check `npx tsc --noEmit` — clean (only the pre-existing `src/main.tsx` TS5097)
- [x] Frontend `next build` — green
- [x] Playwright E2E — **89 passed / 0 failed / 3 skipped** on the live stack
- [ ] `dotnet test Sonivo.slnx` — not run here (no back-end change)
- PostgreSQL / migrations impact: none

## E2E impact

- New/changed journeys: group home + shell presentation, and the create dialogs (custom select). Playwright helpers and the affected specs were updated.

## Security / authorization

- Tenant / Membership / AuthZ impact: none.
- CSRF/cookie auth impact: none.

## Documentation

- `AGENTS.md` (Language policy), `docs/tooling/SKILLS-INVENTORY.md` (adds the `frontend-architecture` skill).
