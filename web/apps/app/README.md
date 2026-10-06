# @sonivo/app

Next.js App Router BFF for Sonivo (ADR-0067). It is the multi-tenant shell over
the existing ASP.NET Core API in `src/`; the .NET modular monolith remains the
only backend and the only writer to PostgreSQL.

## What it provides

- **Host-based tenancy**: the ported product SPA runs in Next through a
  client-only mount (`app/page.tsx` + `src/Mount.tsx`). A client host bridge
  forwards `slug.sonivo.lat/...` to the existing `/g/{slug}` resolver, which
  verifies membership server-side. The full `middleware.ts` +
  `/[tenant]/[locale]` decomposition is deferred — see
  [`PHASE-NEXTJS-PARITY-MIGRATION.md`](../../../docs/03-architecture/PHASE-NEXTJS-PARITY-MIGRATION.md).
- **i18n**: Spanish (default) and English, exposed through a client `useT()`
  provider (the shared `@sonivo/i18n` package also carries Portuguese).
- **Theming**: group branding is applied client-side as native CSS variables
  (`--color-primary`, `--color-secondary`) on `<html>`/`<body>`.
- **Session handoff**: `/session/handoff?code=...` redeems a single-use code for a
  **host-only** session cookie. `start` targets a tenant (`{slug}`) or the product
  host (no slug, `app.sonivo.lat`); the apex → app redirect is enabled with
  `NEXT_PUBLIC_APP_HOST` (see ADR-0067 and
  [`DEPLOYMENT.md`](../../../docs/03-architecture/DEPLOYMENT.md)).

## Security notes

- No parent-domain session cookie is ever used; the .NET session cookie is
  host-only (`Domain` omitted).
- The handoff redemption uses the API's normal same-origin CSRF flow
  (`GET /api/auth/csrf` then `X-CSRF-TOKEN`); no CSRF exemption is introduced.
- Never store tokens in `localStorage`.

## Local development

```bash
npm install
cp .env.example .env.local   # adjust API_ORIGIN / NEXT_PUBLIC_ROOT_DOMAIN
npm run dev
```

Tenant hosts resolve via the apex `NEXT_PUBLIC_ROOT_DOMAIN`; for local testing
use a hosts entry such as `127.0.0.1 coro.localhost` or a real subdomain.

## Build

```bash
npm run build
```
