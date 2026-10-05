# PHASE-NEXTJS-PARITY-MIGRATION — Vite SPA → Next.js (parity + route decomposition)

- **Status:** BRIDGE DONE — the product runs in Next; route decomposition in progress.
- **ADR:** ADR-0067 (strangler).
- **Related:** `PHASE-NEXTJS-MULTITENANT-BFF-SPEC.md`, `web/README.md`.

## What "parity bridge" means

Rather than rewrite 60+ routes by hand, the **entire product SPA was ported into
`@sonivo/app`** and mounted client-only at `app/page.tsx` (via `src/Mount.tsx`),
so **every existing route works in Next immediately**:

- `web/apps/app/src/**` is the ported product (components, pages, providers).
- `app/page.tsx` mounts `ThemeProvider > LanguageProvider > BrowserRouter > App`.
- Shared code lives in `@sonivo/{api-client,i18n,ui}`.
- The Vite app (`web/sonivo-web`) was **deleted**; Docker/CI/E2E were repointed to
  the Next app.

## Deployment model

- **Production:** `NEXT_EXPORT=1 next build` → static `out/` → copied to the .NET
  host's `wwwroot`. The .NET host serves it with an SPA fallback to `index.html`
  (same origin, so `/api` and `/hubs` need no proxy). Single-image model preserved.
- **Dev/CI:** `next dev -p 5173` proxies `/api` + `/hubs` to the API and serves a
  SPA fallback for deep links.

## Done

| Wave | Scope | Status |
|---|---|---|
| **W-A** | Foundations: design tokens, providers, SPA bridge mount | DONE |
| **W-H** | Bridge parity → Dockerfile/CI/E2E repointed → **Vite deleted** | DONE |

## Remaining (quality/tenancy decomposition)

These do **not** block the product (it already runs); they convert the bridge into
idiomatic App Router routes and restore the ADR-0067 features:

| Wave | Scope | Status |
|---|---|---|
| **W-B** | Decompose auth/account routes (login/register/verify/account/security) | TODO |
| **W-C** | Decompose group routes + **restore subdomain tenancy** (`slug.sonvo.lat`) | TODO |
| **W-D** | Repertoire routes | TODO |
| **W-E** | Scheduling routes | TODO |
| **W-F** | Practice routes (client-only APIs stay client components) | TODO |
| **W-G** | Tasks/roles/people/roster, branding editor, search | TODO |

## Definition of done (decomposition)

1. Routes served by App Router (server/client) with the SPA bridge removed.
2. Subdomain tenancy restored (middleware + handoff) per ADR-0067.
3. Next type/lint gating re-enabled (the bridge currently relaxes it).
4. E2E green against the decomposed app.

## Known risks / decisions

- **react-router → App Router** is decomposed per route; until then the SPA
  bridge relies on react-router and client-only rendering.
- **Subdomain tenancy** is not active during the bridge (path tenancy `/g/:slug`);
  restored in W-C.
