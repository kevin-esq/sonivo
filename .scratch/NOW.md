# NOW — agent focus

**Updated:** 2026-10-02

## Checkpoint state

```text
Implementation: COMPLETE — White Label v2 (ADR-0054): brand tokens, secondary colour, banner, organizer editor
Human approval: APPROVED (user: "Pasa a modo Build … Fase 0 … Fases 1 a 4", 2026-10-02)
Git checkpoint: PENDING — about to commit on feature/white-label-workspace
Remote: NOT PUSHED
CI: NOT RUN — local evidence: backend 609 tests ✓ (Domain 141, Api 212, Application 199, Integration 57);
    web build + oxlint (0 errors) ✓; w20-branding E2E 2 passed / 1 skipped ✓;
    regression E2E 11 passed (shell/theme/home/groups) ✓;
    Playwright MCP visual pass (group shell + editor, light/dark, mobile) ✓
```

**Phase:** White Label v2 · **ADR-0054** (amends ADR-0048) · [`PHASE-WHITELABEL-SPEC.md`](../docs/03-architecture/PHASE-WHITELABEL-SPEC.md).
Widens `GroupBranding` with `SecondaryHex` + banner image, defines the scoped `--brand-*` token contract with
server-computed AA `on-*` colours, applies the group `ThemeDefault` only until the user chooses, and wires the
real organizer editor (logo + banner upload, primary/secondary/accent, theme, copy). `Features:GroupBranding`
now defaults **ON**. Scope is a refresh over the current group IA (no Tareas/Roles/Recursos/Archivos sections).

### Operational notes (local E2E runner)

- Serve the E2E SPA with `npm run preview` (static `dist/`), **not** `npm run dev`. On this workstation the Vite
  dev server (and `vite preview` under a full-suite load) can be terminated; run the suite in shards when needed.
  Run `npm run build` first; `vite.config.ts` exposes the API/Hub proxy under `server` and `preview`.
- API: `dotnet run --project src/Sonivo.Api --launch-profile http` with `$env:Auth__EnableTestHook="true"`
  on `:5171`; PostgreSQL on `:5433`. Apply the new migration with `$env:SONIVO_MIGRATE_ON_START="true"`.
- Passkeys E2E CI note: `.github/workflows/ci.yml` browses via `http://localhost:5173`
  (WebAuthn trustworthy-origin fix) — keep when changing E2E.
- Dev-preview note: `/g/{slug}/manifest.webmanifest` is not under the Vite `/api` proxy, so it 404s (console
  manifest error) in `vite preview` only; production serves it from the API on the same origin.

## Current state

- **White Label v2 (ADR-0054)** in progress on `feature/white-label-workspace` (from `develop`, which already
  includes the calendar refactor PR #184).
- **Inicio dashboard phase (ADR-0053) SHIPPED** on `develop` (PR #181, merge `fa0d30e`): `/` = Inicio, `/grupos` =
  Mis grupos, app-shell sidebar, `GET /api/activity/upcoming`.
- **UI/UX redesign (ADR-0043) CLOSED** and **UI/UX polish (W6–W9) CLOSED**.
- **DevSecOps baseline (ADR-0044) ACCEPTED**; residuals tracked in
  [`SECURITY-AUDIT-2026-09.md`](../docs/03-architecture/SECURITY-AUDIT-2026-09.md).
