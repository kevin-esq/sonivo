---
name: validation-symmetry
description: >
  Enforces validation symmetry across Sonivo's boundaries: the server is the
  single source of truth and every request/response contract is validated where
  it crosses a layer, with the client mirroring the same contract when it
  validates. USE FOR: adding or changing request/response models, API endpoints,
  forms, DTOs, or client-side validation. DO NOT USE FOR: authorization/tenancy
  review (use dotnet-secure-architecture), performance (use
  optimizing-ef-core-queries), or generic UI work (use impeccable).
---

# Validation Symmetry (Sonivo)

No data crosses a layer without validation. The **server is authoritative**;
client validation is UX only.

## When to Use

- Adding or changing a request/response model, DTO, or API endpoint.
- Adding or changing a form or client-side validation.
- Deciding where a rule belongs (client vs server).

## Non-Negotiable Invariants

1. **Server-authoritative.** Every value the server acts on is validated
   server-side, regardless of what the client sent. Client checks never replace
   server validation.
2. **Validate at the boundary.** Requests are validated at the API edge;
   responses are shaped explicitly (no entity leakage).
3. **Symmetry when the client validates.** If the client validates a field, it
   encodes the **same** constraint (same names and rules) so the user gets fast
   feedback — but the server remains the enforcement point.
4. **Explicit contracts.** Request/response types are explicit records; do not
   bind domain entities directly (see `dotnet-webapi`).

## Current stack (do not assume otherwise)

| Layer | Reality in Sonivo |
| ----- | ----------------- |
| Backend | .NET 9 / ASP.NET Core. Validation uses the project's existing mechanisms (data annotations / existing patterns). **FluentValidation is NOT adopted.** |
| Frontend | React 19 + TypeScript + Vite. **Zod is NOT adopted** (and there is no Next.js). |
| Tests | Validate with the project's xUnit + Playwright suites. |

> Introducing **FluentValidation** or **Zod** is a dependency change and requires
> explicit approval. The "Zod ↔ FluentValidation" mirroring rule in circulation
> assumes a Next.js + FluentValidation stack that this repository does not have.

## Workflow

### 1. Define the contract once

- Name the type clearly (`Create{Entity}Request`, `{Entity}Response`).
- List every field, its type, required/optional, and its constraints.

### 2. Validate on the server (authoritative)

- Apply the project's existing validation to the request DTO at the boundary.
- Reject unknown/overposted fields; never trust the client's shape.
- Return RFC 7807 problem details on failure (no internal details leaked).

### 3. Mirror on the client (when it validates)

- If (and only if) the client validates, reproduce the **same** constraints and
  names. If a shared schema library is ever adopted (e.g. Zod + a .NET mirror),
  generate both sides from one contract — do not hand-maintain divergent rules.
- Treat client validation as a convenience; never as a security control.

### 4. Cross-check

- Confirm the server rejects the same inputs the client rejects — and more.

## Checklist

- [ ] Request DTO validated server-side at the boundary (not only client-side)
- [ ] No domain entity bound directly; explicit request/response records
- [ ] Client constraints (if any) match the server contract by name and rule
- [ ] Server still guards every rule the client guards
- [ ] Errors are RFC 7807 without internal details
- [ ] Adopting FluentValidation/Zod (if proposed) was explicitly approved

## More Info

- Related skills: `dotnet-webapi` (DTOs/OpenAPI), `react-frontend-security`,
  `dotnet-secure-architecture`.
- ADR-0020 (antiforgery), `AGENTS.md` (engineering discipline).
