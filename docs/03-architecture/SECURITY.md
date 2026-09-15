# SECURITY.md — Sonivo

Security design for MVP. **No implementation.**  
Phase 2.1–2.2 **CLOSED**. Tenancy ADR-0019, CSRF ADR-0020, soft-delete/history ADR-0023 **ACCEPTED** (HUMAN-APPROVED).

AuthN ACCEPTED: Identity + HTTP-only cookie (0009, 0011).  
AuthZ ACCEPTED: Owner \| Member (0012).

---

## 1. Authentication

| Concern | Spec |
| ------- | ---- |
| Register | Email + password; Identity user; email verification |
| Login | Password check; application cookie |
| Logout | Server sign-out; invalidate cookie |
| Current user | `GET /api/auth/me` (no CSRF; safe method) |
| Password hashing | ASP.NET Identity hasher |
| Cookie | HttpOnly; Secure (prod); Path=/; dedicated name; **SameSite=Lax** (ADR-0020) |
| Session vs persistent | `rememberMe` → sliding/persistent (exact TTLs OPEN) |
| Email verify / reset | Single-use tokens; expiry |
| Lockout / rate limit | Identity lockout ON; rate-limit login/forgot (PROPOSED) |
| Failures | Enumeration-safe messaging where needed (forgot password) |

Mobile bearer: FUTURE ADR.

---

## 2. Authorization matrix

Prerequisite: authenticated + Group membership (unless noted).

| Action | Owner | Member |
| ------ | ----- | ------ |
| View Group content (songs, arr, resources meta, setlists, events) | Y | Y |
| Download Resource | Y | Y |
| Create/rename/soft-delete Group | Y | N |
| Invite / remove / role change | Y | N |
| Leave Group | Y* | Y |
| Transfer ownership (promote) | Y | N |
| CRUD Song / Arrangement / Resource | Y | N |
| CRUD Setlist / items | Y | N |
| CRUD Event / replace plan from setlist / cancel | Y | N |
| RSVP | Y | Y |

\*Blocked if last Owner (ADR-0013).

**Distinctions:** AuthN ≠ Membership ≠ Role ≠ Resource scope (`GroupId` on entity).  
No ACL engine.

---

## 3. Tenancy — request-to-database flow (**ACCEPTED ADR-0019**)

### Principle

**CLIENT-SUPPLIED GROUP ID ≠ AUTHORIZATION.**

### Flow

```text
1. Browser sends cookie + route /api/groups/{groupId}/...
2. API: authenticate cookie → UserId (else 401)
3. API: bind route/body DTOs only (no AuthZ decision in controller)
4. Application use-case entry:
     a. Membership = find (UserId, groupId); missing or Group soft-deleted → 404
     b. Role check for the operation → else 403
     c. Load target aggregate WHERE Id = X AND GroupId = groupId
        (missing → 404; never load by Id alone)
     d. For references (ArrangementId, SetlistId, …):
        load related WHERE Id AND GroupId = groupId
        (mismatch/missing → 404/400)
     e. Mutate in transaction; soft-delete filters as specified
5. Infrastructure: tenant queries always parameterized by GroupId
6. Blobs: authorize first; key must start with groups/{groupId}/
```

### Challenge answers (binding intent)

| # | Answer |
| - | ------ |
| A | Changing `groupId` alone **must not** grant access; non-member → **404** |
| B | Membership verified at **Application use-case entry** (before domain mutation / tenant query) |
| C | Yes, if unscoped `GetById` exists — **forbidden** in Application paths |
| D | Cross-Group refs blocked by scoped loads; Membership may reference **any** User (Users are global) |
| E | GroupId is **never** trusted as authorization; only as a claim |
| F | Ports require `GroupId`; no ambient tenant context that silently drops filters |
| G | Denormalized `GroupId` on tenant aggregates is **justified** |
| H | FKs alone are **insufficient** for tenant isolation |
| I | **404** non-members; **403** members lacking role; **401** anonymous |
| J | See §7 security tests |

Membership of User→Group is not a “cross-Group User leak”; identity is platform-scoped.

---

## 4. CSRF strategy (**ACCEPTED ADR-0020**)

### One MVP mechanism

Use **ASP.NET Core’s supported antiforgery** (do not invent a custom token system). Configuration is an implementation detail that must match: SameSite=Lax HttpOnly Identity cookie + same-site SPA/API + `GET /api/auth/csrf` + `X-CSRF-TOKEN` on POST/PUT/PATCH/DELETE → **400** on failure + **no** credentialed CORS. SameSite is defense-in-depth, not the sole CSRF defense.

| # | Spec |
| - | ---- |
| A | Token from ASP.NET antiforgery service |
| B | SPA: `GET /api/auth/csrf` → JSON `{ token }` + antiforgery cookie |
| C | Auth cookie: HttpOnly. CSRF request token: SPA **memory**. Antiforgery pair cookie: framework-managed (readable by JS as designed for double-submit) |
| D | Cookie-authenticated (or cookie-issuing) **mutating** API calls |
| E | POST, PUT, PATCH, DELETE |
| F | `X-CSRF-TOKEN` |
| G | Framework validates header token against antiforgery cookie |
| H | Missing → **400** (no side effects) |
| I | Invalid → **400** |
| J | CSRF before login; POST login with header; re-bootstrap after login |
| K | POST logout requires CSRF |
| L | `/api/auth/me` is GET → **no** CSRF |
| M | **400** Problem Details |
| N | Prod: reverse proxy or API-hosted SPA (same site; prefer same origin) |
| O | No credentialed cross-origin CORS in MVP |

### Threat distinctions

| Mechanism | Protects against | Does **not** protect against |
| --------- | ---------------- | ---------------------------- |
| **CSRF token** | Cross-site forged state-changing requests using victim’s cookie | XSS (attacker can read token), stolen cookies used from attacker’s tools |
| **SameSite=Lax** | Many cross-site cookie sends on CSRF POSTs from other sites | Same-site attackers, some Lax edge cases, XSS |
| **HttpOnly auth cookie** | JS theft of session cookie via XSS | CSRF (cookie still sent), physical/devtools access |
| **CORS** | Browser cross-origin **read** of responses | CSRF by itself (simple form POSTs are not CORS-preflighted the same way); misconfig can worsen CSRF |
| **XSS defenses** | Script injection that defeats CSRF+cookie model | CSRF from a clean foreign site |

**Reliance rule:** SameSite is defense-in-depth, **not** a substitute for antiforgery on cookie APIs. CORS is not the CSRF control. Antiforgery does not replace XSS hardening.

---

## 5. Final security + workflow matrix

| Concern | Canonical mechanism | Layer | Failure |
| ------- | ------------------- | ----- | ------- |
| Tenant isolation | Membership + scoped `(GroupId, Id)` loads | Application (+ DB filters) | 404 |
| Membership | `(UserId, GroupId)` lookup | Application | 404 |
| Role AuthZ | Owner \| Member matrix | Application | 403 |
| Cross-Group refs | Load related with same GroupId | Application | 404/400 |
| CSRF | Antiforgery header + cookie | API middleware | 400 |
| Concurrency | Aggregate root `Version` / `expectedVersion` | Application + DB | 409 |
| Soft delete | Filters on Group/Song/Arr; Event cancel/hide | Application + EF | 404 |
| Historical Event identity | Copied labels on EventSetlistItem (no IgnoreQueryFilters) | Domain + Application | N/A (preserved) |
| Setlist → Event | Replace Event Plan (ADR-0021) | Application tx | 400/409 |

---

## 6. Threat review (MVP)

| Threat | Impact | MVP mitigation | Residual |
| ------ | ------ | -------------- | -------- |
| Cross-Group / IDOR | High | Path claim + membership + scoped queries | Miswritten unscoped query |
| Cookie theft (XSS) | High | HttpOnly; sanitize UI; CSP later | Chart HTML if ever raw (Q8) |
| CSRF | High | ADR-0020 | Wrong prod multi-origin topology |
| Malicious upload | High | AuthZ; type/size limits; non-executable storage | Polyglots |
| Unauthorized Resource download | High | AuthZ before signed URL | Leaked URL until expiry |
| Privilege escalation | High | Role checks in Application | New endpoint missing check |
| Ownership transfer abuse | Med | ADR-0013 in tx | Social engineering |
| Invitation abuse | Med | Expiring tokens; rate limit; OPEN mechanics | Token leak |
| Brute-force / reset abuse | Med | Lockout + rate limit; opaque forgot | Distributed / email flood |
| Error leakage | Low–Med | Problem Details; no stacks in prod | Verbose 500 in dev |
| Mass assignment | Med | Explicit DTOs | |
| Soft-delete bypass | Med | Filters on Group/Song/Arr; Infra-only IgnoreQueryFilters | |
| Accidental plan wipe | Med | `confirmReplace` when Event has items (ADR-0021) | User confirms blindly |

---

## 7. Security tests (must eventually prove)

- Authenticated non-member: every Group-scoped route → **404** (songs, arrangements, resources, setlists, events, RSVP).  
- Member calling Owner mutation → **403**.  
- Swap foreign ArrangementId into SetlistItem / Event / apply body while using victim `groupId` → reject.  
- Resource download for other Group’s id → **404**.  
- Blob key outside `groups/{groupId}/` rejected even if guessed.  
- Mutating request without / with bad `X-CSRF-TOKEN` → **400**.  
- Apply setlist without `confirmReplace` when items exist → **409**.  

---

## 8. Security logging

Log auth failures, lockouts, AuthZ denials (403), ownership changes, Group delete, Resource delete, apply-setlist replace — without passwords, tokens, or CSRF secrets.
