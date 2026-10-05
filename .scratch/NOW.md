# NOW - agent focus

**Updated:** 2026-10-05

## Checkpoint state

```text
Implementation: COMPLETE - Groups mobile-first responsive redesign
  Branch: feature/groups-responsive-redesign (from develop)
  Commit: 147aab6 "feat(groups): mobile-first responsive redesign" (26 files)
  Scope:
    - Tokens: theme-aware --color-primary-ink / --color-success-ink /
      --color-error-ink; group brand ink clamped to the real surface (AA).
    - Navigation: single "Mas" sheet; bottom bar 4 tabs
      (Inicio/Canciones/Eventos/Tareas); dynamic grid (no dead column).
    - Layout/targets: tasks filters wrap; calendar agenda <640px, 44px
      controls, wider desktop rail; 44px targets across groups/settings/
      people/resources/library.
    - States: PageSkeleton/ListSkeleton on group home, calendar, roles,
      events, resources.
    - E2E: w12-mobile-nav updated to the single tab-bar "Mas".
Human approval: APPROVED (owner: "Apruebo todo hazlo", 2026-10-05)
Git checkpoint: COMMITTED (147aab6)
Remote: NOT PUSHED
CI: NOT RUN
```

### Verified this session (live stack: API 5171, Vite 5173, Postgres 5433)
- `npm run build` PASS · `npm run lint` (oxlint) exit 0
- Playwright audit: 14 routes x {320,390,768,1024,1280,1440} x {dark,light}
  - horizontal overflow: 0 / 168 combos
  - contrast < 4.5:1 (composited): 0 violations (13 routes x 5 widths x 2 themes)
  - tap targets < 44 on 320/390/768: none left (only sr-only skip link and the
    stretched card link whose ::after covers the card)
  - keyboard focus: 0 focused controls without a visible indicator (390 + 1440)
- Screenshots: `.visual-audit/redesign-groups/` (before) and
  `.visual-audit/redesign-groups-after/` (after, 168 PNGs)
- w11/w12 assertions verified live (Miembros reachable from tab-bar "Mas";
  tabbar/rail targets >= 44)
- Full E2E suite NOT run locally: API lacks Auth__EnableTestHook (404), so the
  register/confirm helpers cannot create users.

### Notes / follow-ups
- Push / PR / merge NOT authorized yet -> next step is an explicit push/PR gate.
- Console: pre-existing `/g/{slug}/manifest.webmanifest` JSON parse error (unrelated).
- Unrelated local working-tree changes present (not from this task): `.vscode/`,
  `w-h-live-viewer.png`, `.scratch/shots/` - left untouched.
