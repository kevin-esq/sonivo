# NOW — agent focus

**Updated:** 2026-10-02

## Checkpoint state

```text
Implementation: IN PROGRESS — Cuenta completa + calendario general (ADR-0053 addendum): T-HOME-09…16
Human approval: APPROVED (user: "luz verde total … implementación completa", 2026-10-02)
Git checkpoint: PENDING
Remote: NOT PUSHED · branch feature/account-calendar (from develop @ fa0d30e)
CI: NOT RUN
```

**Phase:** [`PHASE-HOME-DASHBOARD-SPEC.md`](../docs/03-architecture/PHASE-HOME-DASHBOARD-SPEC.md) §8 · **ADR-0053** (addendum).
Follow-up on the shipped Inicio dashboard: complete **`/cuenta`** (user card + Información personal / Seguridad /
Notificaciones / Preferencias / Plan / Uso; Plan/Uso/Notificaciones/Sesiones are disabled placeholders),
**groups-only** top search, remove the Inicio "Explorar recursos"/"Buscar" actions and the learning banner, add a
read-only **general calendar `/calendario`** (`GET /api/activity/calendar`), and `PATCH /api/auth/me` for
"Editar perfil".

### Operational notes (local E2E runner)

- Serve the E2E SPA with `npm run preview` (static `dist/`), **not** `npm run dev`. On this workstation the Vite
  dev server (and `vite preview` under a full-suite load) can be terminated; run the suite in shards when needed.
  Run `npm run build` first; `vite.config.ts` exposes the API/Hub proxy under `server` and `preview`.
- API: `dotnet run --project src/Sonivo.Api --launch-profile http` with `$env:Auth__EnableTestHook="true"`
  on `:5171`; PostgreSQL on `:5433`.
- Passkeys E2E CI note: `.github/workflows/ci.yml` browses via `http://localhost:5173`
  (WebAuthn trustworthy-origin fix) — keep when changing E2E.

## Current state

- **Inicio dashboard phase (ADR-0053) SHIPPED** on `develop` (PR #181, merge `fa0d30e`): `/` = Inicio, `/grupos` =
  Mis grupos, app-shell sidebar, `GET /api/activity/upcoming`.
- **F3–F5 white-label waves MERGED**; flags ON.
- **UI/UX redesign (ADR-0043) CLOSED** and **UI/UX polish (W6–W9) CLOSED**.
- **DevSecOps baseline (ADR-0044) ACCEPTED**; residuals tracked in
  [`SECURITY-AUDIT-2026-09.md`](../docs/03-architecture/SECURITY-AUDIT-2026-09.md).
