# ARCHITECTURE.md — Sonivo

Technical architecture for the modular monolith.  
**Phase:** 2.0–2.2 technical specification **CLOSED**; Phase 2.3 foundation **CLOSED**.  
**Status:** Runnable scaffold — product features not implemented.

Domain truth: [`../02-domain/DOMAIN-MODEL.md`](../02-domain/DOMAIN-MODEL.md) · Decisions: [`DECISIONS.md`](DECISIONS.md)

---

## Goals

- Group isolation and server-side AuthZ (never trust client tenant ids)  
- Independently testable domain + application behavior (TDD)  
- First-class HTTP API (OpenAPI) with cookie AuthN for the SPA  
- Deep modules at clear seams; prevent “layered mush”  

## Non-goals

- Microservices, CQRS, event sourcing  
- Web JWT / BFF  
- Postgres RLS in MVP (unless later ADR)  
- Vendor-locked storage choice as a domain concern  

---

## Runtime shape

```text
┌──────────────────────────────────────────────┐
│  React + TS + Vite + Tailwind (SPA)          │
│  same-site with API; cookie session          │
└────────────────────┬─────────────────────────┘
                     │ HTTPS / OpenAPI / cookie
┌────────────────────▼─────────────────────────┐
│  ASP.NET Core host                           │
│  API → Application → Domain                  │
│  Infrastructure adapters (EF, blobs, email)  │
└───────┬──────────────────────────┬───────────┘
   PostgreSQL                 Object storage
```

**Dev:** Vite proxy → API (shared cookie domain via proxy).  
**Prod:** Same-site (API serves SPA and/or reverse proxy). Hosting **OPEN**.

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
  sonivo-web/   # Vite React TS Tailwind
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
