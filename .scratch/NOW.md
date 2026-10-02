# NOW — agent focus

**Updated:** 2026-10-02

## Checkpoint state

```text
Implementation: COMPLETE — Phase Home dashboard (ADR-0053): T-HOME-01…07 done; T-HOME-08 git in progress
Human approval: APPROVED (user: "luz verde total … implementación completa", 2026-10-02)
Git checkpoint: COMMITTED — 3 atomic commits on feature/home-dashboard
Remote: PUSHED · PR #181 (feature/home-dashboard → develop)
CI: RUNNING — local evidence: backend 596 tests ✓; web build + oxlint (0 errors) ✓;
    E2E shards 66 passed / 3 skipped (practice TC-PLAY-SYNC-01 flake re-ran green);
    Playwright MCP visual pass (light/dark, desktop/mobile, drawer, search focus) ✓
```

**Phase:** [`PHASE-HOME-DASHBOARD-SPEC.md`](../docs/03-architecture/PHASE-HOME-DASHBOARD-SPEC.md) · **ADR-0053**.
`/` becomes the **Inicio dashboard**; `/grupos` hosts Mis grupos; persistent left sidebar for signed-in
non-group routes; `GET /api/activity/upcoming` powers "Tu próxima actividad". Billing/notifications are
disabled placeholders (ADR-0042 / FUTURE stand).

### Operational notes (local E2E runner)

- Serve the E2E SPA with `npm run preview` (static `dist/`), **not** `npm run dev`. On this workstation the
  Vite dev server is silently terminated under test load. Run `npm run build` first; `vite.config.ts`
  exposes the API/Hub proxy under both `server` and `preview`.
- API: `dotnet run --project src/Sonivo.Api --launch-profile http` with `$env:Auth__EnableTestHook="true"`
  on `:5171`; PostgreSQL on `:5433`.
- Passkeys E2E CI note: `.github/workflows/ci.yml` browses via `http://localhost:5173`
  (WebAuthn trustworthy-origin fix) — keep when changing E2E.
- **AppHeader phase:** W1 shipped; decision D4 is superseded by ADR-0053 for `/` and the account routes;
  W2–W8 are re-homed into the Home dashboard phase where still wanted.

## Current state

- **Home dashboard phase (ADR-0053) IN PROGRESS** on `feature/home-dashboard`.
- **F3–F5 white-label waves MERGED** (develop @ a2fd972, main @ 28318c5); flags ON.
- **UI/UX redesign (ADR-0043) CLOSED** and **UI/UX polish (W6–W9) CLOSED**; audit remediation Steps 1–8 merged (PR #163).
- **DevSecOps baseline (ADR-0044) ACCEPTED**; P0 + waves implemented, residuals tracked in
  [`SECURITY-AUDIT-2026-09.md`](../docs/03-architecture/SECURITY-AUDIT-2026-09.md).
- Pending optional: docs PR to promote ADR-0046/0047/0048 into `DECISIONS.md`.
