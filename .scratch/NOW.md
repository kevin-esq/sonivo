# NOW - agent focus

**Updated:** 2026-10-07

## Checkpoint state

```text
Branch: refactor/frontend-restructure  ->  PR #238 (base develop)
Implementation: IN PROGRESS
Human approval: PENDING
Git checkpoint: PARTIAL (latest commits not yet pushed)
Remote: PUSHED UP TO 25bbcdc / NEW COMMITS LOCAL
CI: NOT RUN (pending push)
```

### Committed on this branch (newest first)
- 636d525 feat(web): real audio preview in the create-song wizard
- 532b84d refactor(web): English i18n key namespaces (1084 keys)
- b7a46d5 refactor(web): home metrics, home-only rail, invite dialog, account-scoped theme
- (earlier) marketing landing + pre-paint theme; guided create-song wizard

### Language policy (HARD)
- Code/comments/logs/tests/back-end/routes/commits: English.
- i18n **keys/tags: English** (`songs.*`, `settings.*`, `dashboard.*`, `songCreate.*` …).
  Only user-visible copy is localized: es (default), en, pt.

## Done this session
- Group banner removed; group switcher moved to the top bar.
- Home-only live metrics from the usage endpoint; context rail is home-only.
- Member invitation is an owner dialog on the Members tab.
- Group-level theme/locale controls removed from settings (account-scoped); the
  shell no longer forces a theme default and re-fetches branding on group update.
- Branding cached per group → group colour paints on the first frame (no flash).
- Public marketing landing at `/bienvenido` (+ pre-paint theme script).
- Guided create-song wizard (Details → Audio → Arrangement → Review → Done) with
  drag-and-drop, validation, sections and a **real decoded waveform + preview player**.
- i18n tags fully renamed to English (tsc clean; i18n-sensitive E2E green).

## Remaining (not done)
- **Arrangement editor UI/UX** (`ArrangementDetailPage`) 2-column redesign + preview.
  NOTE: track/stem lanes (Voz/Batería/Bajo…) need a new model — today there is a
  single `audio` resource per arrangement; UI must not fake multi-track data.
- **Notifications** via SignalR (hub + inbox + bell). `/cuenta/notificaciones` is a
  placeholder; `GroupHub` is NOT in this branch.
- **Observability / error handling**: global ErrorBoundary, client error reporting
  endpoint, advanced audit view (audit endpoint exists: `GET /api/groups/{id}/audit`).
- **Plans**: `/plan` is a placeholder; pricing/gating needs definition.
- **boneyard-js** skeletons (authorized; install + CLI capture pending).
- **Push + CI + merge of PR #238.**

## Notes
- Local stack: API 127.0.0.1:5171 (`Auth__EnableTestHook=true`), Next dev 5173, Postgres 5433.
- Do NOT run `next build` while the dev server is up.
- Untracked non-project files to never commit: `.vscode/`, `.turbo/`, `.scratch/shots/`,
  `.scratch/security-sweep-26df6f5/`, `.scratch/*.mjs` scratch scripts.
