---
name: dotnet-secure-architecture
description: >
  Hardens and audits Sonivo's ASP.NET Core + EF Core + Identity backend for
  security defects: server-enforced Group authorization, cookie/antiforgery
  correctness, injection (SQL/LINQ), secret handling, mass assignment, and safe
  error responses.
  USE FOR: writing or reviewing backend endpoints, EF Core queries, auth/tenancy
  code, exception/error middleware, and configuration; security review of a .NET
  change.
  DO NOT USE FOR: behavior-preserving refactors (use csharp-refactoring), EF Core
  query performance (use optimizing-ef-core-queries), endpoint shape/OpenAPI
  (use dotnet-webapi), or frontend work (use react-frontend-security).
---

# .NET Secure Architecture (Sonivo)

Security-first rules for the Sonivo backend: **.NET 10 / ASP.NET Core, EF Core,
ASP.NET Core Identity, PostgreSQL**, modular monolith. Apply these while writing
or reviewing backend changes.

## When to Use

- Adding or changing API endpoints, services, or EF Core queries.
- Touching authentication, authorization, tenancy, or role checks.
- Configuring exception handling, logging, or provider credentials.
- Performing a security pass over a backend diff or PR.

## Non-Negotiable Invariants

1. **CLIENT-SUPPLIED GROUP ID ≠ AUTHORIZATION.** Every Group-scoped read/write
   must resolve the caller's Group membership and role **server-side** from the
   authenticated principal. Never trust a `groupId` from the route, body, query,
   or headers as proof of access.
2. **Identity cookie + antiforgery** is the web auth model (ADR-0020). No web
   JWT, no BFF. State-changing requests must require a valid antiforgery token.
3. **Owner/Member roles** are enforced on the server. UI checks are convenience
   only and never a security boundary.
4. **No secrets in git.** Google user sign-in uses
   `Authentication:Google:ClientId` / `ClientSecret`; **never** reuse the `Email:*` transport credentials.
5. Domain concepts stay separate: **Song**, **Arrangement**, and
   **Arrangement Resource** are distinct; do not collapse or conflate them when
   enforcing access.

## Workflow

### 1. Map the trust boundary

- Identify who the caller is (authenticated user) and which Group the operation
  targets.
- Find where membership/role is loaded and verified. If it is not verified
  server-side, stop and fix that first.
- Prefer a single authorization helper/query per resource; do not scatter ad-hoc
  `if (group.OwnerId == userId)` checks.

### 2. Validate input at the edge

- Validate shape and range on request DTOs at the API boundary. This repository
  uses ASP.NET Core data annotations and existing project patterns — **do not**
  introduce FluentValidation or another framework unless the project already
  uses it or the user explicitly asks.
- Reject overposting: bind only explicit fields; never bind an EF entity
  directly from the request body.
- Canonicalize and validate any path/file identifier before use.

### 3. Query safely (EF Core)

- Use **parameterized LINQ** for all queries. LINQ translates to parameterized
  SQL; do not build query text by concatenation or interpolation.
- If raw SQL is unavoidable, use `FromSqlInterpolated` / `ExecuteSqlInterpolated`
  or explicit `DbParameter` values — **never** `FromSqlRaw($"... {input} ...")`.
- Keep `AsNoTracking()` on read-only queries and project to DTOs instead of
  returning tracked entities.

```csharp
// GOOD — parameterized
var group = await db.Groups
    .AsNoTracking()
    .FirstOrDefaultAsync(g => g.Id == groupId, ct);

// BAD — raw string interpolation
var sql = $"SELECT * FROM Groups WHERE Id = '{groupId}'";
var group = await db.Groups.FromSqlRaw(sql).FirstOrDefaultAsync(ct);
```

### 4. Fail safely

- Error responses use **RFC 7807 Problem Details**. Never return exception
  messages, stack traces, SQL, or internal identifiers outside `Development`.
- Log the full exception **server-side** with a correlation id; return a safe,
  user-facing message to the client.
- Avoid distinct error responses that let a caller enumerate other tenants'
  resources (prefer a uniform 404 for "not found or not yours").

### 5. Handle secrets and configuration

- Read secrets from configuration/environment; never hardcode or log them.
- Do not log tokens, cookies, connection strings, or full request bodies that may
  contain credentials.
- Keep the email transport path (ADR-0068) and the Google sign-in path on separate
  config keys and scopes.

## Checklist

- [ ] Group membership and role verified server-side for every scoped operation
- [ ] No client-supplied `groupId`/role used as authorization
- [ ] Antiforgery enforced on state-changing endpoints (ADR-0020)
- [ ] Input validated at the boundary; no entity binding / overposting
- [ ] EF Core queries parameterized; no interpolated `FromSqlRaw`
- [ ] Errors are RFC 7807 with no stack traces / exception text outside `Development`
- [ ] Logs contain no secrets, tokens, or credentials
- [ ] `Authentication:Google:*` used for sign-in; `Email:*` not reused
- [ ] Song / Arrangement / Arrangement Resource kept distinct

## Common Pitfalls

| Pitfall | Solution |
| ------- | -------- |
| Trusting a `groupId` from the client | Load membership/role from the authenticated principal server-side. |
| Scattering authorization `if` checks | Centralize in one server-side helper/query per resource. |
| Binding an EF entity to a request DTO | Use explicit request/response records; project manually. |
| Building SQL with string interpolation | Use LINQ or parameterized raw SQL APIs. |
| Returning `exception.Message` to clients | Return safe Problem Details; log details server-side. |
| Distinct "exists but forbidden" responses | Return a uniform 404 to avoid cross-tenant enumeration. |
| Putting sign-in secrets under `Email:*` | Keep Google sign-in keys separate from the email transport scope. |

## More Info

- OWASP ASVS / Top 10 (authorization, injection, error handling).
- ADR-0020 (CSRF/antiforgery), ADR-0044 (security tooling), `AGENTS.md`
  (tenancy/auth invariants).
- Related skills: `dotnet-webapi`, `optimizing-ef-core-queries`,
  `webappsec-review` (user-global ambient), `differential-review`.
