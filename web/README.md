# Sonivo web monorepo

Turborepo workspace for the Sonivo frontends (ADR-0067). The .NET API is the only
backend; no app here accesses PostgreSQL directly.

## Apps

| App | Path | Host(s) | Status | Purpose |
|---|---|---|---|---|
| `@sonivo/app` | `apps/app` | `sonvo.lat`, `app.sonvo.lat`, `slug.sonvo.lat` | NEXT (migrating) | Product shell: marketing (`(saas)`), auth, tenant workspace, session handoff |
| `@sonivo/docs` | `apps/docs` | `docs.sonvo.lat` / `/docs` | NEW | Documentation (Fumadocs) |
| `@sonivo/mobile` | `apps/mobile` | App stores | FUTURE (placeholder) | Future mobile app (Expo/React Native) |
| `sonivo-web` | `sonivo-web` | `sonvo.lat` | **LIVE (production)** | Current Vite SPA — the shipped product UI |

> **Migration is a strangler (ADR-0067).** `sonivo-web` (Vite) is the **live
> production UI** and must **not** be deleted until `@sonivo/app` reaches feature
> parity and the edge switch is done. Deleting it early breaks the `Dockerfile`,
> the CI "Frontend build" job and the Playwright E2E suite.

## Commands (run from `web/`)

```bash
npm install            # install all workspaces
npm run dev            # run every app (turbo)
npm run app            # only @sonivo/app
npm run docs           # only @sonivo/docs
npm run build          # build every app
```

`sonivo-web` is **not** a workspace member; it keeps its own install/build
(`cd sonivo-web && npm install && npm run build`) until it is retired.

## Shared code (`packages/*`)

Cross-app code (design system, i18n dictionaries, .NET API client) will live in
`packages/*` and be extracted incrementally from `apps/app`.

| Package | Purpose | Status |
|---|---|---|
| `@sonivo/ui` | Design tokens and shared primitives | EXTRACTED (initial: `vars`) |
| `@sonivo/i18n` | es/en/pt dictionaries + `useT()` | EXTRACTED |
| `@sonivo/api-client` | Typed client over the .NET API | EXTRACTED |
| `@sonivo/config` | Shared tsconfig / tailwind / lint config | PLANNED |

## Host routing (target)

- `sonvo.lat` — marketing + login (apex).
- `app.sonvo.lat` — cross-group account/panel.
- `slug.sonvo.lat` — a group workspace (host-based tenancy; see ADR-0067).
- `docs.sonvo.lat` — this documentation app.

## Retiring `sonivo-web` (definition of done)

1. `@sonivo/app` reaches feature parity with the Vite SPA (account, security,
   library, setlists, events, RSVP, practice, tasks, roles, resources, settings).
2. `Dockerfile` builds and serves `apps/app`; `render.yaml`/`PublicOrigin` updated.
3. CI "Frontend build" and Playwright E2E target the Next app.
4. Then — and only then — delete `sonivo-web`.

Until all four hold, `sonivo-web` stays.
