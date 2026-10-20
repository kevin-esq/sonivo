---
name: group-tenancy-isolation
description: >
  Keeps Sonivo tenancy correct: Group is the only tenant, a User belongs to many
  Groups through Membership, and every Group-scoped read/write is authorized
  server-side per request. Forbids the ambient-tenant model (HasQueryFilter on
  GroupId, ITenantContext, tenant JWT claims) and mandates (GroupId, EntityId)
  lookups on tenant stores.
  USE FOR: writing or reviewing any Group-scoped endpoint, handler, store, or EF
  Core query; multi-tenancy questions; when someone proposes an ambient tenant
  filter, TenantId column, or tenant claim.
  DO NOT USE FOR: general backend endpoint shape (use dotnet-webapi), authorization
  hardening review of a change (use dotnet-secure-architecture), EF Core query
  performance (use optimizing-ef-core-queries), or frontend routing/UI (use
  frontend-architecture).
---

# Group Tenancy Isolation (Sonivo)

Sonivo does not do "ambient tenant". **Group is the tenant** (ADR-0005), a User
belongs to **many** Groups through `Membership`, and every Group-scoped request is
re-authorized **server-side** from the authenticated principal (ADR-0019). This
skill is the single place the rule lives; cite it and ADR-0079 instead of
re-deriving tenancy from external tutorials.

Authoritative decision: **ADR-0079 (ACCEPTED)** (`docs/03-architecture/DECISIONS.md`).

## When to Use

- Adding or changing a Group-scoped endpoint, use-case handler, or store.
- Reviewing any query that reads a Group-owned aggregate.
- Someone proposes an ambient tenant filter, `ITenantEntity`, `ITenantContext`,
  a `TenantId` column, or a tenant claim in a token.
- Answering "how does a user access multiple bands / `user@group` login?".

## Non-Negotiable Invariants

1. **Group is the tenant.** `Group` is the data-isolation boundary. `Organization`
   (ADR-0072) groups Groups for billing/UX — it is **not** an authorization tenant.
2. **Many-to-many by membership.** `Membership` links a User to many Groups and
   carries the role. `Membership.Handle` (`handle@slug`, ADR-0047) is an optional
   login handle, never a tenant id.
3. **No ambient tenant context.** There is no server-side "current group". Every
   Group-scoped use-case receives `groupId` as an argument and verifies it with
   `GroupAccessService.Require{Member,Owner,Manager,Participant}Async` before any
   load or mutation. Non-member → **404** (never leak existence). ADR-0086 also
   requires a transaction-local database scope for RLS; that scope is created
   only after principal and membership validation and does not replace this
   application check.
4. **No `HasQueryFilter` on `GroupId`.** Query filters exist only for soft-delete
   (`DeletedAt == null`). An ambient tenant filter is **PROHIBITED**: it fails open
   when the tenant is unset and duplicates the check ADR-0019 already requires.
5. **Tenant stores are `(GroupId, EntityId)`.** Forbidden: unscoped
   `GetByIdAsync(entityId)` on a Group-owned aggregate (ADR-0019 §4). `IGroupStore.
   GetByIdAsync(groupId)` is allowed because the GroupId *is* the aggregate id;
   `IResourceStore.GetByIdAsync(arrangementId, resourceId)` is allowed because the
   arrangement is itself Group-scoped.
6. **Cross-Group references load with the same GroupId.** When attaching A→B, load
   B scoped to A's `groupId`; mismatch → 404/400. FKs are not isolation.
7. **Client tenant values are selectors.** Route/body/query `groupId`, `by-slug`
   lookups, and the `Host` slug are claims to verify, never grants.
8. **No web JWT / tenant claims.** Identity cookie + antiforgery only (ADR-0019/0020);
   the tenant is per-request and never a token claim.
9. **No parent-domain cookie.** Host-only cookie + single-use handoff (ADR-0067/0069).
10. **RLS is defense in depth.** Under ADR-0086, PostgreSQL policies deny
    cross-Group rows for the constrained runtime role. They do not implement
    RBAC or item grants and do not protect arbitrary SQL executed as that same
    role. RLS rollout must follow the gates in
    `docs/03-architecture/PHASE-4.2-POSTGRESQL-RLS-SPEC.md`.

## Correct shape vs prohibited shape

```csharp
// CORRECT — per-request membership check, then entity-scoped load.
public async Task<Result> Handle(Guid groupId, Guid songId, CancellationToken ct)
{
    await _access.RequireManagerAsync(groupId, _currentUser.Id, ct); // 404 if non-member
    var song = await _songs.GetByIdAsync(groupId, songId, ct);       // (GroupId, EntityId)
    if (song is null) return NotFound();                             // 404 in-group
    ...
}

// PROHIBITED — ambient tenant filter.
modelBuilder.Entity<Song>()
    .HasQueryFilter("TenantGroupFilter", s => s.GroupId == _tenant.CurrentGroupId);
```

## How to answer the recurring questions

- **"Multi-tenant with a TenantId column + global filter?"** No. Group is the
  tenant; membership is the gate; explicit Group scope and database RLS are
  separate layers; see invariants 3–5 and 10.
- **"Login as `baterista@losrockers`?"** That is `Membership.Handle` + Group slug
  (ADR-0047). The slug is a selector; the handle is resolved server-side; the
  session is a host-only Identity cookie. No per-tenant JWT.
- **"Subdomain per band?"** Supported by host-based tenancy (ADR-0067/0069). The
  host slug is a selector; membership is re-verified. No parent-domain cookie.

## Enforcement (making it mandatory)

- **Build-time:** `tests/Sonivo.Integration.Tests/GroupIsolationArchitectureTests.cs`
  fails if a tenant store exposes an unscoped `GetByIdAsync(entityId)` or an
  ambient tenant accessor appears. A documented `AllowedUnscoped` set exists for
  genuinely non-tenant stores; adding to it requires justification.
- **Generation-time:** this skill + ADR-0079.
- **Runtime:** `GroupAccessService` + the affected service's own tenant test.
  Existing IDOR coverage: `tests/Sonivo.Application.Tests/ApplyEventPlanUseCaseTests.cs`.

## Current stack (do not assume otherwise)

| Concern | Reality in Sonivo |
| ------- | ----------------- |
| Tenant | `Group` (ADR-0005) |
| Membership | N:N `User`↔`Group` via `Membership` |
| Authorization | `GroupAccessService` per request, server-side |
| Database row isolation | PostgreSQL RLS defense in depth under ADR-0086; rollout gated by Phase 4.2 |
| Query filters | soft-delete only |
| Web auth | Identity cookie + antiforgery (ADR-0020) |
| Tenant in token | none — no web JWT/BFF |
| Cross-subdomain session | host-only cookie + handoff code (ADR-0067/0069) |
