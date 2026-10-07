# NOW - agent focus

**Updated:** 2026-10-07

## Checkpoint state

```text
Branch: refactor/frontend-restructure (from develop 38d72ad) - one big PR (owner choice)
Language policy (HARD): code/comments/logs/tests/back-end/routes/commits = English;
  only UI copy localized via t(); locales es(default)/en/pt.
  Recorded in AGENTS.md + .agents/skills/frontend-architecture/SKILL.md.

DONE on this branch:
  - i18n split: i18n/locales/{es,en,pt}.ts + thin index.tsx + keys.ts.
  - Portuguese locale: 1229 keys, parity es=en=pt; language picker shows 3.
  - api split: api/client.ts -> thin barrel + api/http.ts + per-domain modules (152 exports).
  - Spanglish sweep: Spanish comments -> English; hardcoded UI copy -> t() (new keys in es/en/pt).
  - Group shell redesign: top bar (group search) + persistent right context rail
    (Semana / Hoy / Listas / Tu progreso) + new group home (welcome hero + quick-action
    cards + upcoming events). Profile de-duplicated (removed from the sidebar; lives in
    the top bar). Banner moved into the content column (aligns with the card).
  - Fixed extra document scroll: group workspace is now a fixed full-viewport app frame
    (md:fixed md:inset-0) so only the inner content scrolls.
  - Themed scrollbars + color-scheme (app/globals.css) - the active stylesheet.
  - E2E: hardened create helpers (custom-select step inside the retried unit); specs
    updated for the new role presentation and player labels.

PENDING:
  - Verify the full E2E green (running), then push + open the PR (big restructure).
  - Split the god pages: GroupSettingsPage(9), GroupsPage(14), GroupTasksPage(14),
    ArrangementDetailPage(7), PracticePage(5), EventDetailPage(6), GroupWorkspace.
  - "Back-end in English" is NOT done: still many Spanish back-end messages and ~49 E2E
    assertions depend on them. Doing it needs error codes + client-side mapping (the UI
    must stop rendering raw backend text) and E2E updates - a separate, larger slice.
```

### Notes
- Active frontend: `web/apps/app/src`; the ACTIVE stylesheet is `app/globals.css`
  (`src/index.css` is not bundled by the Next shell). Do not run `next build` while the
  dev server is up (clobbers `.next`).
- Unrelated untracked files: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-*.
