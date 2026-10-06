# Sonivo web monorepo

Turborepo workspace for the Sonivo frontends (ADR-0067). The .NET API is the only
backend; no app here accesses PostgreSQL directly.

## Apps

| App | Path | Host(s) | Purpose |
|---|---|---|---|
| `@sonivo/app` | `apps/app` | `sonivo.lat`, `app.sonivo.lat`, `slug.sonivo.lat` | The product: marketing, auth, group workspace, session handoff |
| `@sonivo/docs` | `apps/docs` | `docs.sonivo.lat` / `/docs` | Documentation (Fumadocs) |
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

Two shapes, one codebase (see
[`DEPLOYMENT.md`](../docs/03-architecture/DEPLOYMENT.md)):

- **Staging (Render):** the product app is a **static export** served by the .NET
  host from `wwwroot` (same origin, SPA fallback to `index.html`).

  ```bash
  cd web
  NEXT_EXPORT=1 npm run build --workspace @sonivo/app   # -> apps/app/out -> wwwroot
  ```

- **Production (Vercel):** the Next **server** build (BFF) runs without
  `NEXT_EXPORT`; server-side rewrites proxy `/api` and `/hubs` to
  `API_ORIGIN=https://api.sonivo.lat`.

In dev/CI, Next proxies `/api` and `/hubs` to the API and serves a SPA fallback
for deep links.

## Shared packages (`packages/*`)

| Package | Purpose |
|---|---|
| `@sonivo/i18n` | es/en/pt dictionaries + `useT()` |
| `@sonivo/api-client` | Typed client over the .NET API |
| `@sonivo/ui` | Design tokens / brand CSS variables |
| `@sonivo/config` | Shared tsconfig / tailwind / lint config (planned) |

## Host routing

Authoritative host map and DNS/TLS runbook:
[`DEPLOYMENT.md`](../docs/03-architecture/DEPLOYMENT.md) §2 and §5.

- `sonivo.lat` (+ `www`) — marketing / entry to auth (apex).
- `app.sonivo.lat` — authenticated product entry.
- `account.sonivo.lat` (optional) — account/security/consent.
- `slug.sonivo.lat` — a group workspace (host-based tenancy; ADR-0067).
- `api.sonivo.lat` — the .NET API, consumed by the BFF (not the browser).
- `docs.sonivo.lat` — this documentation app.
