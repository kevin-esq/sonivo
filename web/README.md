# Sonivo web monorepo

Turborepo workspace for the Sonivo frontends (ADR-0067). The .NET API is the only
backend; no app here accesses PostgreSQL directly.

## Apps

| App | Path | Host(s) | Purpose |
|---|---|---|---|
| `@sonivo/app` | `apps/app` | `sonvo.lat`, `app.sonvo.lat`, `slug.sonvo.lat` | The product: marketing, auth, group workspace, session handoff |
| `@sonivo/docs` | `apps/docs` | `docs.sonvo.lat` / `/docs` | Documentation (Fumadocs) |
| `@sonivo/mobile` | `apps/mobile` | App stores | Future mobile app (Expo/React Native); placeholder |

`@sonivo/app` currently runs the ported product SPA inside Next via a client-only
mount (`app/page.tsx` + `src/Mount.tsx`), so every existing route works while the
routes are progressively converted to the App Router (see
[`PHASE-NEXTJS-PARITY-MIGRATION.md`](../docs/03-architecture/PHASE-NEXTJS-PARITY-MIGRATION.md)).

## Commands (run from `web/`)

```bash
npm install            # install all workspaces
npm run dev            # run every app (turbo)
npm run app            # only @sonivo/app (Next dev on :5173)
npm run docs           # only @sonivo/docs
npm run build          # build every app
```

## Deployment model

The product app is a **static export** served by the .NET host from `wwwroot`
(same origin, SPA fallback to `index.html`), preserving the single-image model:

```bash
cd web
NEXT_EXPORT=1 npm run build --workspace @sonivo/app   # -> apps/app/out -> wwwroot
```

In dev/CI, Next proxies `/api` and `/hubs` to the API and serves a SPA fallback
for deep links.

## Shared packages (`packages/*`)

| Package | Purpose |
|---|---|
| `@sonivo/i18n` | es/en/pt dictionaries + `useT()` |
| `@sonivo/api-client` | Typed client over the .NET API |
| `@sonivo/ui` | Design tokens / brand CSS variables |
| `@sonivo/config` | Shared tsconfig / tailwind / lint config (planned) |

## Host routing (target)

- `sonvo.lat` — marketing + login (apex).
- `app.sonvo.lat` — cross-group account/panel.
- `slug.sonvo.lat` — a group workspace (host-based tenancy; ADR-0067).
- `docs.sonvo.lat` — this documentation app.
