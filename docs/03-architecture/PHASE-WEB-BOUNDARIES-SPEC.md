# Web surfaces and route ownership

- **Status:** AUTHORIZED by ADR-0089 (2026-10-18); implementation in progress.
- **ADR:** [ADR-0089](./DECISIONS.md#adr-0089--route-catalog-and-isolated-public-identity-and-product-surfaces).
- **Scope:** frontend routing, marketing SEO, and public/identity/product host separation.
- **Unchanged:** .NET API, PostgreSQL, Identity data, Group tenancy authorization,
  antiforgery contract, and host-only session invariant.

## Current state

- The existing `@sonivo/app` bridge mounts React Router client-only for product
  and auth paths. A separate `@sonivo/marketing` App Router workspace now renders
  the public locale pages on the server; DNS has not been cut over.
- The route tree is declared in `web/apps/app/src/AppRouter.tsx`; session/bootstrap
  orchestration stays in `web/apps/app/src/App.tsx`. Canonical frontend
  route builders and aliases now live in the shared `web/packages/routes/`
  package. The app-local module is only an import adapter.
- The current app deployment still contains the former marketing routes in the
  browser SPA. The new standalone marketing workspace is implemented locally,
  but it is not deployed or serving production traffic yet.
- `app.sonivo.lat` is a configured target, but the repo does not yet have an
  identity deployment or independent marketing/app deployments.
- Staging uses static export and .NET fallback. A static export cannot make
  request-time host decisions or run Next middleware.
- The API remains one .NET backend and currently exposes its endpoint mappings
  from `src/Sonivo.Api/Program.cs`; its routes are not web-page routes.

## Target surface map

| Host | App | Indexing | Session / data |
| --- | --- | --- | --- |
| `sonivo.lat` | Marketing | Public pages only | No product session required; public API only if needed |
| `auth.sonivo.lat` | Identity | `noindex, nofollow` | Host-only Identity cookie; explicit API BFF proxy; CSRF on mutations |
| `app.sonivo.lat` | Product | `noindex, nofollow` | Host-only handoff cookie; API BFF proxy; server authorization |
| `<slug>.sonivo.lat` | Group workspace | `noindex, nofollow` | Host-only session; membership checked by API on every Group operation |
| `api.sonivo.lat` | .NET API | Not a web document host | API and SignalR; no direct browser origin |

Marketing, identity, and product each own an independent Next deployment and
environment. Group subdomains route through the product deployment with exact
host validation; they do not get per-Group deployments or parent-domain
cookies. Shared packages may hold pure route types, design tokens, and localized
copy; they must not cause marketing to ship app/auth runtime code. Use explicit
CSP/CORS/OAuth allowlists, separate build/deploy credentials, and no wildcard
subdomain trust.

## Route ownership

1. `web/packages/routes/` owns canonical web route patterns, builders, host
   URL construction, and legacy alias maps. `web/apps/app/src/routing/routes.ts`
   is a compatibility adapter. Call sites use builders for dynamic IDs and
   exported constants for fixed destinations. Legacy aliases redirect to the
   canonical route.
2. Route declarations consume route patterns from that catalog. If a route
   changes, its builders and route declaration change at one source.
3. API endpoint paths remain owned by .NET endpoint modules. The browser API
   client consumes the API contract; it does not import Next page paths.
4. Host routing, BFF rewrites, and external redirect allowlists belong to the
   deployment adapter, not the page-route catalog. Internal return paths must
   remain same-origin and validated.
5. Canonical URLs and sitemap entries belong to public marketing pages. Private
   routes and tenant paths must never enter the sitemap.

### Canonical browser path namespaces (ADR-0092)

- Marketing owns `/` and its localized public pages.
- Product owns `/app/...`, including `/app/home`, `/app/groups`,
  `/app/groups/:groupId/...`, account pages, and `/app/join/:token`.
- Identity owns `/auth/...`, including login, registration, verification,
  recovery, handoff, and branded Group login.
- Existing root-level paths remain aliases that redirect to the canonical
  namespace while preserving URL state and dynamic path data.
- API paths remain `/api/...` and are not affected by browser route prefixes.

## Migration tickets

### WBR-01 — Canonical route catalog

- **Done locally:** route constants/builders and legacy redirect map define the
  `/app` product and `/auth` identity namespaces. `AppRouter.tsx` registers
  canonical routes and compatibility redirects; in-app links, login returns,
  invitation links, Group paths, and notification destinations use the catalog.
- **Gate:** static scan and route-level tests show no duplicated canonical
  destination literals outside the catalog or route-local declarations.

### WBR-02 — Server-rendered marketing and SEO

- **Implemented locally:** `web/apps/marketing` serves `/es`, `/en`, and `/pt`
  as server-rendered pages with localized metadata, canonical/hreflang, Open
  Graph, `robots.txt`, and a public-only sitemap. The root redirects to `/es`.
- **Validated locally:** the marketing production build passed on Next.js
  16.3.8; generated HTML contains localized page content, titles, descriptions,
  canonical and language alternate metadata. The generated sitemap contains
  only `/es`, `/en`, and `/pt` with `x-default`; `robots.txt` points to that
  sitemap. This validates the build artifact, not deployed response headers,
  domain ownership, or Google indexing.
- Keep the public landing in its independent App Router workspace. Continue
  using the shared es/en/pt copy, meaningful HTML content, per-language
  metadata, canonical/hreflang tags, Open Graph, sitemap, and robots policy.
- Keep signup/login links aimed at the identity host and product CTA aimed at
  the product host; keep these origins in validated server deployment config.
- Remaining gate: verify deployed HTML and response headers on the production-like
  host matrix, and confirm private hosts/paths cannot be indexed. Google indexing
  and search ranking require post-deployment verification.

### WBR-03 — App Router decomposition

- Move marketing, auth/account, Group, repertoire, and scheduling surfaces out
  of the monolithic SPA bridge into App Router route segments and layouts.
- Keep client components for browser APIs and interactive state. Server
  Components may render public content and fetch only data safe for that page.
- Re-enable Next type checking once the bridge is removed. Preserve the staging
  static path until WBR-06 is ready.

### WBR-04 — Identity host and session handoff

- Deploy the identity surface at `auth.sonivo.lat`; keep apex auth working during
  rollout and use explicit same-origin redirects.
- Verify password, Google OAuth, confirmation, reset, MFA, passkeys, logout,
  antiforgery, rate limits, safe `next`, one-time code redemption, expiry, replay,
  and host mismatch across auth → app and auth → Group hosts.
- Decide and validate passkey RP ID migration before DNS cutover. Do not silently
  invalidate credentials or broaden RP ID trust to arbitrary subdomains.
- API authorization stays authoritative; the client and host selector do not
  grant Group membership.

### WBR-05 — Independent marketing and product deployments

- **Implemented locally:** `@sonivo/marketing` is a standalone workspace with
  only the shared copy and routing packages. Its deployment target is the apex.
- **Remaining:** independently deploy `@sonivo/app` and the identity surface;
  assign exact hosts and environment variables; verify each BFF and header
  policy before DNS cutover.
- Create separate deployment projects/build outputs for identity and product;
  marketing already has its own workspace. Use separate deploy credentials, environment variables, CSP,
  cache policy, and origin allowlists.
- Proxy API/hub requests through each intended BFF origin. No frontend should
  expose an API origin that bypasses the deployed same-origin proxy.
- Gate: production-like host matrix, cookie scope, CORS/CSP, OAuth callback,
  cache isolation, and noindex verification pass before cutover.

### WBR-06 — Request-aware staging

- Replace the static export bridge with a staging Next server/deployment capable
  of host-based routing and per-host response headers.
- Preserve staging DB/data isolation and keep production secrets out of staging.
- Gate: deep links, API proxy, realtime, auth, host redirects, and security
  headers work on staging without the .NET static fallback.

## Security and SEO acceptance criteria

- Marketing can render and be indexed without executing the product SPA bundle.
- App, auth, and Group pages return `X-Robots-Tag: noindex, nofollow` or
  equivalent metadata; private URLs are excluded from sitemap and canonicals.
- Session cookies remain host-only, `Secure`, `HttpOnly`, `SameSite=Lax`, and
  `__Host-` prefixed in production. Never use `Domain=.sonivo.lat`.
- Handoff codes are short-lived, single-use, opaque, and not leaked through
  referrers, logs, analytics, or third-party scripts.
- OAuth callbacks, CSP, and CORS use explicit exact origins. Do not trust
  `*.sonivo.lat`.
- Every Group operation performs server-side membership/role checks regardless
  of route, host, or client state.
- No DB engine migration, additional identity store, frontend JWT, or new
  third-party routing dependency is part of this work.

## External release gates

The repo change does not create DNS records, Vercel projects, TLS certificates,
Google OAuth console entries, or production secrets. The operator must configure
those resources after local implementation and before redirects/cutover. Until
then, the apex remains the working identity entry point.
