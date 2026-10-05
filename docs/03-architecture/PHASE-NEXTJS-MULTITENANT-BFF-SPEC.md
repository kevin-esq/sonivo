# PHASE-NEXTJS-MULTITENANT-BFF-SPEC — Next.js multi-tenant shell (BFF over the .NET API)

- **Status:** ACCEPTED — user-authorized 2026-10-05 (owner: "Sí: ADR superador + implementar").
- **ADR:** ADR-0067 (see [`DECISIONS.md`](./DECISIONS.md)).
- **Related:** ADR-0009/0010/0011 (stack, Identity cookie), ADR-0043 (i18n), ADR-0048/0049 (white-label, hosts), ADR-0060 (typography), ADR-0054 (branding), ADR-0020 (CSRF).
- **Branch:** `feature/nextjs-multitenant-bff`.

---

## 1. Decision summary (ADR-0067)

Sonivo introduces a **Next.js App Router frontend** that behaves as a **BFF over the existing ASP.NET Core API**:

- The **.NET modular monolith remains the only backend** (domain, Identity, EF Core, SignalR, OpenAPI contract). Next never touches PostgreSQL.
- Tenancy is **host-based**: `slug.sonvo.lat` is rewritten internally to `/[tenant]/[locale]/...`. The apex (`sonvo.lat`) serves marketing/auth pages.
- **i18n**: Spanish default, English and Portuguese selectable. `Locale` negotiation happens in middleware; dictionaries are loaded server-side and hydrated into a client provider that preserves the existing `useT()` shape.
- **Branding**: group colours/typography/theme are fetched server-side and injected as native CSS variables (`--color-primary`, `--color-secondary`) on `<html>`/`<body>`.
- **Session across subdomains**: central authentication at the apex + **single-use, short-lived handoff code** exchanged on the tenant host for a **host-only session cookie**. A parent-domain cookie (`Domain=.sonvo.lat`) is **PROHIBITED**.

`ADR-0067` **amends** the frontend row and the "Do not introduce Next.js" principle of **ADR-0010**; the .NET backend decision stands. It **unblocks the host/subdomain work of ADR-0049** (documentation-only until now) and **extends ADR-0043** to Portuguese. Backend message/mail localisation stays out of scope (ADR-0043 phase 2).

## 2. Why this is safe to add without breaking the shipped app

- The Next app lives in the **Turborepo workspace** (`web/apps/app/`) alongside the shipped Vite SPA (`web/sonivo-web/`). The existing Docker image, CI frontend build, and Playwright suites are untouched.
- The .NET API keeps its routes and contract; new capabilities are **additive** (`/api/session/handoff*`).
- Rollout is a **strangler** migration (ADR-0043 waves): Vite stays the production UI until the Next shell reaches parity and is switched at the edge.

## 3. Security model (binding)

| Control | Requirement | Source |
|---|---|---|
| Session cookie scope | Host-only; `Domain` omitted. `SameSite=Lax`, `HttpOnly`, `Secure`. Prefer `__Host-` prefix in non-dev. | OWASP Session Management; OWASP Subdomain Takeover; MDN |
| Cross-subdomain SSO | Never a parent-domain cookie. Central auth at apex + **handoff code** per tenant host. | ADR-0049; OWASP; IETF `draft-moros-oauth-browser-session-handoff` |
| Handoff code | ≥256-bit CSPRNG, opaque, **single-use (atomic)**, TTL ≤ 120 s, stored server-side (hashed), bound to issuing UA hash (advisory), rate-limited redemption. | IETF draft §4.1/§6 |
| Handoff page | `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, no third-party scripts, generic errors. | IETF draft §6.2/§6.4/§6.6 |
| Tenant identity | `slug` from the `Host` header is a **selector only**; membership is verified server-side for the authenticated principal. | OWASP Multi-Tenant |
| Passkeys / OAuth | Registered at the **apex origin only**; never rely on cross-subdomain WebAuthn or wildcard redirect URIs. | W3C WebAuthn; OWASP Subdomain Takeover |
| CSP / CORS | No `*.sonvo.lat` wildcards; explicit allowlists; exact-match OAuth `redirect_uri`. | OWASP Subdomain Takeover |
| DNS / TLS | Wildcard `*.sonvo.lat` + wildcard TLS; decommissioning runbook; CT-log monitoring. Requires a verified custom domain (ADR-0049 D2). | OWASP Subdomain Takeover |

## 4. Architecture

```
Browser ──host: slug.sonvo.lat──► Next middleware ──rewrite──► /[tenant]/[locale]/...
   │                                                     │
   │                                                     └─ SSR fetches branding (public API)
   │
   └─ /api/*  and  /hubs/*  ──rewrites──► ASP.NET Core API (:5171)
                                           ├─ Identity cookie (host-only)
                                           ├─ antiforgery (X-CSRF-TOKEN)
                                           ├─ SignalR hub
                                           └─ /api/session/handoff/start|redeem
```

### Monorepo layout (`web/`)

```text
web/                          # Turborepo workspace (root package.json + turbo.json)
  apps/
    app/                      # @sonivo/app — product shell (Next.js)
      app/
        layout.tsx            # <html>/<body> + SSR theme vars (x-tenant-slug / x-locale)
        (saas)/page.tsx       # sonvo.lat landing
        (saas)/login/page.tsx # apex auth
        (saas)/pricing/page.tsx
        [tenant]/[locale]/    # slug.sonvo.lat workspace
          layout.tsx          # validates tenant, provides dictionary
          page.tsx  rehearsals/page.tsx  repertoire/page.tsx
          session/handoff/    # POST redeem (same-origin CSRF)
          not-found.tsx
      lib/i18n/... lib/api/... lib/theme/... components/AttendanceTracker.tsx
      middleware.ts  next.config.ts
    docs/                     # @sonivo/docs — Fumadocs (docs.sonvo.lat / /docs)
      app/docs/[[...slug]]/page.tsx  app/api/search/route.ts
      content/docs/*.mdx  lib/source.ts
  packages/                   # shared code (ui / i18n / api-client / config), extracted incrementally
  sonivo-web/                 # legacy Vite SPA (retired after parity)
```

Each app owns its own `package.json`, `next.config`, `tsconfig` and `middleware`.
`sonivo-web/` (Vite) remains the production UI until the Next shell reaches parity.

### Backend additions (.NET, additive)

`src/Sonivo.Api/Session/` — `SessionHandoffService`, `ISessionHandoffStore`, `InMemorySessionHandoffStore`, `SessionHandoffEndpoints`; cookie host-only; handoff rate-limit policy. No schema change (slug resolution reuses `ITenantResolver`; `GroupDomain` for custom domains is deferred to the custom-domain phase per ADR-0049 D3).

## 5. Tickets / waves

| ID | Deliverable | Depends on | Status |
|---|---|---|---|
| **T-NEXT-01** | ADR-0067 + this spec | — | done (this PR) |
| **T-NEXT-02** | Next.js BFF scaffold: middleware (subdomain + i18n), root/tenant layouts with SSR theme, marketing + tenant pages | T-NEXT-01 | done (this PR) |
| **T-NEXT-03** | i18n es/en/pt extracted, `useT()` preserved, `AttendanceTracker` client component | T-NEXT-02 | done (this PR) |
| **T-NEXT-04** | .NET session-handoff backend + host-only cookie + tests | T-NEXT-01 | done (this PR) |
| **T-NEXT-05** | Edge/hosting: wildcard DNS + TLS, custom domain verification, `PublicOrigin`/passkey rpId per host | T-NEXT-04 | FUTURE (infra) |
| **T-NEXT-06** | Page-by-page strangler migration of remaining Vite routes | T-NEXT-02 | FUTURE |
| **T-NEXT-07** | Backend message/mail localisation (ADR-0043 phase 2) | T-NEXT-03 | FUTURE |
| **T-NEXT-08** | `GroupDomain` table + TXT/CNAME verification + custom domains | T-NEXT-05 | FUTURE (ADR-0049 D3) |
| **T-NEXT-09** | Mobile app at `web/apps/mobile` (Expo/React Native) consuming shared `packages/*` + the .NET API | T-NEXT-02 | FUTURE (placeholder reserved) |

## 6. Out of scope (explicit)

- No rewrite of the .NET domain, EF Core model, or Identity internals.
- No web JWT/BFF token storage (ADR-0009/0011 unchanged).
- No parent-domain session cookie (PROHIBITED).
- No backend string/mail localisation in this phase.
- No custom-domain storage (`GroupDomain`) in this phase.
- No wildcard CSP/CORS or wildcard OAuth redirect URIs.

## 7. Validation

- `dotnet build Sonivo.slnx -c Release` → green.
- `dotnet test Sonivo.slnx -c Release --filter SessionHandoff` → green (handoff service).
- `web`: `npm install` + `turbo run build` (builds `@sonivo/app` and `@sonivo/docs`).
- Manual: middleware host/locale matrix; handoff single-use/expiry/replay/UA-mismatch/non-member cases.
