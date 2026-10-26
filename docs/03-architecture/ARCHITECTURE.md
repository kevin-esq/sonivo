# ARCHITECTURE.md — Sonivo

Technical architecture for Sonivo's modular monolith and web clients.
**Status:** Product implementation is active; current operational gates are tracked in [`.scratch/NOW.md`](../../.scratch/NOW.md).

Domain truth: [`../02-domain/DOMAIN-MODEL.md`](../02-domain/DOMAIN-MODEL.md) · Decisions: [`DECISIONS.md`](DECISIONS.md)

---

## Goals

- Group isolation and server-side AuthZ (never trust client tenant ids)  
- Independently testable domain + application behavior (TDD)  
- First-class HTTP API (OpenAPI) behind the accepted Next.js BFF and Identity cookie flow
- Deep modules at clear seams; prevent “layered mush”  

## Non-goals

- Microservices, CQRS, event sourcing  
- Browser-held web JWTs or direct frontend database access
- Enabling PostgreSQL RLS before the Phase 4.2 acceptance gates pass
- Vendor-locked storage choice as a domain concern  

---

## Runtime shape

```text
┌──────────────────────────────────────────────┐
│  Next.js App Router + React + TypeScript     │
│  server-rendered public + client app shell   │
└────────────────────┬─────────────────────────┘
                     │ HTTPS / OpenAPI / cookie
┌────────────────────▼─────────────────────────┐
│  ASP.NET Core host                           │
│  API → Application → Domain                  │
│  Infrastructure adapters (EF, blobs, email)  │
└───────┬──────────────────────────┬───────────┘
   PostgreSQL                 Object storage
```

The public marketing site and authenticated product UI are separate Next.js
workspaces. The product's canonical identity and product routes render through
App Router layouts and route segments. React Router remains only as the static
export compatibility entry used by the .NET fallback and for unknown Group
paths during the WBR-06 transition. The Next server proxies API and realtime
traffic. The browser uses the existing Identity cookie and antiforgery
contract; the frontend never accesses PostgreSQL or decides Group authorization.

### Web workspace structure

```text
web/
  apps/
    app/        # Authenticated product and identity bridge; Next App Router host
      app/      # Next routes and layouts; canonical product routes share an auth shell
      src/
        appRuntime/ # Shared session state for the root layout and route tree
        api/    # Product domain adapters; shared HTTP transport
        i18n/   # Product dictionaries and typed useT() interface
        groups/ # Group workspace capabilities and settings modules
    marketing/  # Public, localized, indexable marketing surface
    docs/       # Project documentation site
  packages/
    api-client/ # Shared HTTP transport, CSRF, and typed API adapters
    i18n/       # Marketing copy and locale configuration
    routes/     # Canonical browser paths, builders, hosts, and legacy aliases
    ui/         # Brand-variable adapter for server-rendered surfaces
```

### Frontend module rules

- Each application owns its route registration, layouts, and deployment adapter.
  Applications do not import from one another; reusable code belongs in a
  shared package only when at least two surfaces need the same stable interface.
- `@sonivo/routes` is the sole source for canonical browser paths and dynamic
  path builders. Product domain adapters in `apps/app/src/api` use the shared
  `@sonivo/api-client` transport for HTTP, CSRF, response parsing, and normalized
  errors; API endpoint paths remain owned by the .NET application.
- Inside the product app, organize behavior by capability. A route page
  orchestrates feature hooks and view modules; hooks own I/O and state, view
  modules own rendering, and pure transformations stay in feature-local model
  or `lib` modules. Group Settings is the first migrated module under
  `apps/app/src/groups/settings`. The root layout owns shared client session,
  theme, language, audio, rail-presence, and toast providers in
  `apps/app/src/appRuntime`. Identity routes and all fixed product destinations
  (`/app`, Home, Groups, Join, Calendar, Help, Plans, and Account) are
  statically generated App Router routes. Product routes share an authenticated
  shell and route-aware navigation adapter. The Group overview, every current
  Group section and detail, Practice, Settings, invitation, slug entry, and
  branded Group login are App Router-owned. The
  React Router bridge is retained only for `NEXT_EXPORT=1` parity and unknown
  Group paths until the staging cutover passes. Account UI and Group-scoped UI
  remain separate per ADR-0074.
- Depend inward through narrow interfaces: pages → feature modules → typed API
  adapters. Shared packages must not import application code or deployment
  configuration. Client code never receives server secrets or authorization
  authority.
- Keep localized UI copy in the locale dictionaries (`es`, `en`, `pt`) and use
  the typed translation interface. Identifiers, routes, logs, and API errors
  remain English.
- Prefer small, focused page modules and deep feature modules. Extract a module
  when it owns cohesive behavior or creates a useful seam; do not add pass-through
  wrappers or split files by line count alone.

---

## Layers and dependency rules

| Layer | Responsibility | May reference | Must NOT |
| ----- | -------------- | ------------- | -------- |
| **Domain** | Entities, VOs, aggregate invariants, domain events (in-process only if needed) | Nothing outward | EF, HTTP, Identity, blobs, React |
| **Application** | Use-cases / commands / queries; cross-aggregate invariants; transactions; AuthZ orchestration | Domain; ports (interfaces) | EF concrete types; Controllers; UI |
| **Infrastructure** | EF Core, Identity store, blob adapter, email, clock | Domain (+ Application ports implementations) | Controllers calling Domain bypassing Application for mutations |
| **API** | HTTP, DTOs, auth middleware, OpenAPI, antiforgery | Application; Identity cookie pipeline | Domain persistence details; business rules in controllers |
| **Frontend** | Routes, forms, Member/Owner UX, API client | HTTP API only | Direct DB; trusting client-only AuthZ |

**Dependency direction:** Frontend → API → Application → Domain ← Infrastructure.

**Rule:** Controllers are adapters. All mutating and tenant-scoped reads go through Application use-cases that verify membership.

### Preventing an uncontrolled layered monolith

- Organize **by feature/capability** under Domain/Application (Repertoire, Scheduling, Tenancy, Identity), not by technical type folders alone.  
- Public Application interfaces are the seam for tests and API.  
- Infrastructure implements ports; no “god DbContext usage” from API.  
- Cross-module calls prefer Application orchestration, not Domain→Domain cycles.  

Confidence: **HIGH** that modular monolith is sufficient for MVP.

---

## Solution projects

```text
src/
  Sonivo.Domain/
  Sonivo.Application/
  Sonivo.Infrastructure/
  Sonivo.Api/
web/
  apps/          # Next.js application workspaces
  packages/      # Shared routes, API client, marketing i18n, and UI tokens
tests/
  Sonivo.*.Tests/
```

Solution file: `Sonivo.slnx`.

---

## Related specs

| Doc | Contents |
| --- | -------- |
| [`PERSISTENCE.md`](PERSISTENCE.md) | PostgreSQL + EF Core contract (Phase 2.2 **CLOSED**) |
| [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) | Aggregates, invariants, tenancy, concurrency, deletes, storage, copy-on-apply, errors, observability, frontend |
| [`API.md`](API.md) | HTTP surface |
| [`SECURITY.md`](SECURITY.md) | AuthN/AuthZ, CSRF, threats |
| [`TESTING.md`](TESTING.md) | TDD pyramid |

---

## Still required before product features

1. Explicit human approval for the next implementation phase  
2. Hosting OPEN (must preserve same-site topology for ADR-0020)  
3. PostgreSQL available to apply `InitialFoundation` for local end-to-end DB work  
4. Q8–Q11 remain product OPEN (mostly non-blocking for first features)
