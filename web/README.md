# Sonivo web monorepo

Turborepo workspace for the Sonivo frontends (ADR-0067). The .NET API is the only
backend; no app here accesses PostgreSQL directly.

## Apps

| App | Path | Host(s) | Purpose |
|---|---|---|---|
| `@sonivo/app` | `apps/app` | `sonvo.lat`, `app.sonvo.lat`, `slug.sonvo.lat` | Product shell: marketing (`(saas)`), auth, tenant workspace, session handoff |
| `@sonivo/docs` | `apps/docs` | `docs.sonvo.lat` / `/docs` | Documentation (Fumadocs) |
| `@sonivo/mobile` *(FUTURE)* | `apps/mobile` | App stores | Reserved placeholder for the future mobile app (Expo/React Native); not implemented |

`sonivo-web/` is the legacy Vite SPA; it stays the production UI until the Next
shell reaches parity (strangler migration).

## Commands (run from `web/`)

```bash
npm install            # install all workspaces
npm run dev            # run every app (turbo)
npm run app            # only @sonivo/app
npm run docs           # only @sonivo/docs
npm run build          # build every app
```

## Shared code

Cross-app code (design system, i18n dictionaries, .NET API client) will live in
`packages/*` as it is extracted from `apps/app`. Until then it lives inside the app.

## Host routing (target)

- `sonvo.lat` — marketing + login (apex).
- `app.sonvo.lat` — cross-group account/panel.
- `slug.sonvo.lat` — a group workspace (host-based tenancy; see ADR-0067).
- `docs.sonvo.lat` — this documentation app.
