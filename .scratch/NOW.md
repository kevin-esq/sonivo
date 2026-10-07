# NOW - agent focus

**Updated:** 2026-10-07

## Checkpoint state

```text
Branch: refactor/frontend-restructure (from develop 38d72ad)
Language policy (HARD, user 2026-10-07): code/comments/logs/tests/back-end/routes/
  commits = English; only UI copy is localized via t(); locales es(default)/en/pt.
  Recorded in AGENTS.md + .agents/skills/frontend-architecture/SKILL.md.

DONE (in this branch so far):
  - Group shell redesign (WIP commit): top bar with group search, persistent right
    context rail (Tu semana / Hoy / Tus listas / Tu progreso), and a new group home
    (welcome hero + quick-action cards + upcoming events).
  - i18n split: i18n/locales/{es,en,pt}.ts + thin index.tsx + keys.ts. Added a
    complete Brazilian Portuguese locale (1229 keys, parity es=en=pt).
  - Spanglish sweep of the components introduced/merged: GroupContextRail, GroupTopBar,
    GroupHomePage, GroupLimitNotice, GroupStates, GroupDialog now use t(); new keys
    added to all 3 locales (home.*, rail.*, topbar.*, plan.*, state.*, common.close).
  - frontend-architecture skill created; SKILLS-INVENTORY updated.

PENDING (big restructure, one PR as requested):
  - api/client.ts (1309 lines, 152 exports) -> api/http.ts + per-domain modules.
  - Split god pages: GroupSettingsPage(9), GroupsPage(14), GroupTasksPage(14),
    ArrangementDetailPage(7), PracticePage(5), EventDetailPage(6), GroupWorkspace.
  - Finish the Spanglish sweep across the WHOLE frontend (pre-existing literals)
    and English-ify back-end messages/hub errors (no Spanish strings in code).

Verification so far: tsc clean (only pre-existing main.tsx TS5097); next build green;
E2E subset running.
Human approval: APPROVED (owner: "haz todo ... un PR grande ... no pares")
Git checkpoint: IN PROGRESS (branch not pushed)
```

### Notes
- Active frontend: `web/apps/app/src`. Legacy `web/sonivo-web` is ignored.
- Do not run `next build` while the dev server is up (it clobbers `.next`).
- Unrelated untracked files: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-*.
