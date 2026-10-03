# NOW — agent focus

**Updated:** 2026-10-03

## Checkpoint state

```text
Implementation: COMPLETE — ADR-0055 group workspace redesign W-A…W-H all merged (PRs #186-#192)
Human approval: APPROVED (owner 2026-10-03: "Sí: ADR-0055 + todas las olas W-A…W-H" + IA refinement + hidden sidebar scrollbars)
Git checkpoint: COMMITTED — develop at a2a76c0 (W-G merge)
Remote: PUSHED · all PRs merged to develop
CI: PASSING — every wave green (Backend, Frontend, Playwright E2E, CodeQL, SCA)
```

**Phase:** Group workspace redesign · **ADR-0055** (amends ADR-0054; addendum 2026-10-03) ·
[`PHASE-WORKSPACE-REDESIGN-SPEC.md`](../docs/03-architecture/PHASE-WORKSPACE-REDESIGN-SPEC.md).

Waves: W-A shell/home + W-B songs **merged** (PR #186, #187). W-C calendar, W-D resources, W-E
members/presence, W-F song detail, W-G tasks, W-H i18n/a11y/E2E/docs pending.

### IA addendum (owner, 2026-10-03)

- Sidebar: Inicio · **Música** (Canciones, Listas) · **Organización** (Calendario, Eventos, Tareas) ·
  **Equipo** (Miembros, Roles) · **Recursos** · Configuración. "Biblioteca" and "Archivos" are no
  longer top-level; files are attachments and `/archivos` redirects to `/recursos`.
- Both sidebars hide their scrollbar while staying scrollable (`.no-scrollbar`).

### Operational notes (local E2E runner)

- Serve the E2E SPA with `npm run preview` (static `dist/`), **not** `npm run dev`; run `npm run build` first.
- API: `dotnet run --project src/Sonivo.Api --launch-profile http` with `$env:Auth__EnableTestHook="true"`
  on `:5171`; PostgreSQL on `:5433`. Apply new migrations with `$env:SONIVO_MIGRATE_ON_START="true"`.
- CI browses via `http://localhost:5173` (WebAuthn trustworthy origin) — keep when changing E2E.
