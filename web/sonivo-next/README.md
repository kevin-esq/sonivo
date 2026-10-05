# sonivo-next

Next.js App Router BFF for Sonivo (ADR-0067). It is the multi-tenant shell over
the existing ASP.NET Core API in `src/`; the .NET modular monolith remains the
only backend and the only writer to PostgreSQL.

## What it provides

- **Host-based tenancy**: `slug.sonvo.lat` is rewritten by `middleware.ts` to the
  internal `/[tenant]/[locale]/...` routes. The apex serves marketing/auth.
- **i18n**: Spanish (default), English and Portuguese dictionaries loaded
  server-side and exposed through a client `useT()` provider.
- **Dynamic theming (SSR)**: group branding is fetched server-side and injected
  as native CSS variables (`--color-primary`, `--color-secondary`) on `<html>`.
- **Session handoff**: `/session/handoff?code=...` redeems a single-use code for a
  host-only session cookie on the tenant host (see ADR-0067).

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
