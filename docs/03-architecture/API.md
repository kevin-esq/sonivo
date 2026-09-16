# API.md — Sonivo

HTTP API conceptual surface. **No controllers.** Phase 2.2 **CLOSED**. ADR-0019–0023 **ACCEPTED**.

Auth: cookie session (ADR-0011). CSRF: [`SECURITY.md`](SECURITY.md) / ADR-0020.  
Tenancy: `/api/groups/{groupId}/...` + membership (ADR-0019). **CLIENT-SUPPLIED GROUP ID ≠ AUTHORIZATION.**

Convention: JSON; Problem Details ([`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) §8).

---

## Auth

| Use case | Method | Route | Auth | AuthZ | Input | Output | Success | Failures | Idempotent |
| -------- | ------ | ----- | ---- | ----- | ----- | ------ | ------- | -------- | ---------- |
| CSRF bootstrap | GET | `/api/auth/csrf` | No | — | — | `{ token }` + antiforgery cookie | 200 | — | Yes |
| Register | POST | `/api/auth/register` | No | — | email, password, displayName? | user id / pending verify | 201 | 400, 409 | No |
| Login | POST | `/api/auth/login` | No | — | email, password, rememberMe? | user summary; Set-Cookie | 200 | 400, 401 | No |
| Logout | POST | `/api/auth/logout` | Yes | — | — | — | 204 | 401 | Yes |
| Current user | GET | `/api/auth/me` | Yes | — | — | user + memberships summary | 200 | 401 | Yes |
| Verify email | POST | `/api/auth/verify-email` | No* | — | token | — | 204 | 400 | Yes |
| Forgot password | POST | `/api/auth/forgot-password` | No | — | email | always opaque 202/204 | 202 | 400 | Yes |
| Reset password | POST | `/api/auth/reset-password` | No | — | token, newPassword | — | 204 | 400 | No |

\*May require logged-out token flow only.

**CSRF:** All POST/PUT/PATCH/DELETE send `X-CSRF-TOKEN` (ADR-0020). GET `/api/auth/me` does not. Missing/invalid CSRF → **400**.

---

## Groups & membership

| Use case | Method | Route | Auth | AuthZ | Notes | Success | Failures |
| -------- | ------ | ----- | ---- | ----- | ----- | ------- | -------- |
| Create Group | POST | `/api/groups` | Yes | Authenticated | Creator becomes Owner | 201 | 400 |
| Get Group | GET | `/api/groups/{groupId}` | Yes | Member | | 200 | 401, 404 |
| Rename / settings | PATCH | `/api/groups/{groupId}` | Yes | Owner | | 200 | 403, 404, 409 |
| Soft-delete Group | DELETE | `/api/groups/{groupId}` | Yes | Owner | Soft | 204 | 403, 404 |
| List my Groups | GET | `/api/groups` | Yes | — | Memberships | 200 | 401 |
| Invite (MVP) | POST | `/api/groups/{groupId}/invitations` | Yes | Owner | Mechanics OPEN | 201 | 403, 400 |
| Accept invite | POST | `/api/invitations/{token}/accept` | Yes | Invitee | | 204 | 400, 409 |
| List members | GET | `/api/groups/{groupId}/members` | Yes | Member | | 200 | 404 |
| Remove member | DELETE | `/api/groups/{groupId}/members/{userId}` | Yes | Owner | Owner rules ADR-0013 | 204 | 403, 409 |
| Promote/demote | POST | `/api/groups/{groupId}/members/{userId}/role` | Yes | Owner | body role | 204 | 403, 409 |
| Leave | POST | `/api/groups/{groupId}/leave` | Yes | Member/Owner | Last Owner blocked | 204 | 409 |

---

## Repertoire

**Authoritative Phase 3.2 contract:** [`PHASE-3.2-REPERTOIRE-SPEC.md`](PHASE-3.2-REPERTOIRE-SPEC.md) (API DTOs, AuthZ, concurrency, tickets). Summary below.

**Phase 3.2 status:** approved scope **COMPLETED** — T-3.2.01–05 (API), T-3.2.07 (React Library Shell), T-3.2.08 (sparse Playwright). File Resource **DEFERRED** (T-3.2.06: upload/`IBlobStore`/`content`). Next work requires human decision / authorization.

All `...` = `/api/groups/{groupId}`. Soft-deleted Songs/Arrangements excluded (GET → **404**). No list pagination/search in MVP.

**PATCH (Song / Arrangement / Resource):** omitted or JSON `null` → keep; non-null → apply; optional whitespace-only text → store `null`. JSON `null` does **not** clear. Arrangement `defaultBpm` (1–400) cannot be cleared via PATCH in current MVP.

| Use case | Method | Route | AuthZ | Notes | Success | Failures |
| -------- | ------ | ----- | ----- | ----- | ------- | -------- |
| List Songs | GET | `.../songs` | Member | Order by Title, Id | 200 | 401, 404 |
| Create Song | POST | `.../songs` | Owner | Song only; zero Arrangements ALLOWED | 201 | 401, 403, 404, 400 |
| Get Song | GET | `.../songs/{songId}` | Member | | 200 | 401, 404 |
| Update Song | PATCH | `.../songs/{songId}` | Owner | `expectedVersion` required | 200 | 401, 403, 404, 400, 409 |
| Soft-delete Song | DELETE | `.../songs/{songId}` | Owner | Body `{ expectedVersion }`; cascade live Arrs (ADR-0025 §8a) | 204 | 401, 403, 404, 400, 409 |
| List Arrangements | GET | `.../songs/{songId}/arrangements` | Member | Live only; order CreatedAt | 200 | 401, 404 |
| Create Arrangement | POST | `.../songs/{songId}/arrangements` | Owner | Label required; no IsDefault | 201 | 401, 403, 404, 400 |
| Get Arrangement | GET | `.../arrangements/{arrangementId}` | Member | Includes resource summaries | 200 | 401, 404 |
| Update Arrangement | PATCH | `.../arrangements/{arrangementId}` | Owner | `expectedVersion` required | 200 | 401, 403, 404, 400, 409 |
| Soft-delete Arrangement | DELETE | `.../arrangements/{arrangementId}` | Owner | Body `{ expectedVersion }`; Resources left | 204 | 401, 403, 404, 400, 409 |
| List Resources | GET | `.../arrangements/{arrangementId}/resources` | Member | Link Resources | 200 | 401, 404 |
| Create Resource | POST | `.../arrangements/{arrangementId}/resources` | Owner | **Link only** (`kind=link`); `url` required; reject `file` | 201 | 401, 403, 404, 400 |
| Get Resource | GET | `.../arrangements/{arrangementId}/resources/{resourceId}` | Member | Includes `url`; nested route only | 200 | 401, 404 |
| Update Resource | PATCH | `.../arrangements/{arrangementId}/resources/{resourceId}` | Owner | purpose/label/part/note; `kind`/`url` immutable; **no** expectedVersion | 200 | 401, 403, 404, 400 |
| Delete Resource | DELETE | `.../arrangements/{arrangementId}/resources/{resourceId}` | Owner | Hard-delete; nested route only | 204 | 401, 403, 404 |

**Not supported:** flat `.../resources/{resourceId}` get/patch/delete.

**Deferred (T-3.2.06):** file Resource create/upload; nested `.../resources/{id}/content`; `IBlobStore`. See [`PHASE-3.2-REPERTOIRE-SPEC.md`](PHASE-3.2-REPERTOIRE-SPEC.md).

---

## Setlists

| Use case | Method | Route | AuthZ | Notes | Success | Failures |
| -------- | ------ | ----- | ----- | ----- | ------- | -------- |
| List | GET | `.../setlists` | Member | | 200 | 404 |
| Create | POST | `.../setlists` | Owner | | 201 | 403 |
| Get | GET | `.../setlists/{setlistId}` | Member | Items included | 200 | 404 |
| Update | PATCH | `.../setlists/{setlistId}` | Owner | Metadata | 200 | 409 |
| Delete | DELETE | `.../setlists/{setlistId}` | Owner | Hard; null Event.sourceSetlistId | 204 | 403 |
| Replace items | PUT | `.../setlists/{setlistId}/items` | Owner | Full ordered list; duplicates OK | 200 | 400, 409 |
| Add item | POST | `.../setlists/{setlistId}/items` | Owner | | 201 | 400 |
| Update item | PATCH | `.../setlists/{setlistId}/items/{itemId}` | Owner | Overrides/order | 200 | 404 |
| Remove item | DELETE | `.../setlists/{setlistId}/items/{itemId}` | Owner | | 204 | 404 |

---

## Events & RSVP

| Use case | Method | Route | AuthZ | Notes | Success | Failures |
| -------- | ------ | ----- | ----- | ----- | ------- | -------- |
| List | GET | `.../events` | Member | Active; optional includeCancelled for Owner | 200 | 404 |
| Create | POST | `.../events` | Owner | type, time, location?, notes? | 201 | 400 |
| Get | GET | `.../events/{eventId}` | Member | Items + tombstones | 200 | 404 |
| Update | PATCH | `.../events/{eventId}` | Owner | Metadata | 200 | 409 |
| Cancel / soft-hide | POST | `.../events/{eventId}/cancel` | Owner | | 204 | 403 |
| Replace Event Plan from Setlist | POST | `.../events/{eventId}/apply-setlist` | Owner | body: setlistId, **expectedVersion**, **confirmReplace** if items exist; full replace (ADR-0021) | 200 | 400, 409 |
| Replace items manually | PUT | `.../events/{eventId}/items` | Owner | Hand-built plan | 200 | 400 |
| Patch item | PATCH | `.../events/{eventId}/items/{itemId}` | Owner | Overrides | 200 | 404 |
| RSVP | PUT | `.../events/{eventId}/rsvp` | Member | body status | 200 | 400, 404 |
| List RSVPs | GET | `.../events/{eventId}/rsvps` | Member | | 200 | 404 |

---

## Design notes

- Non-member → **404**; member wrong role → **403**; anonymous → **401** (ADR-0019).  
- `POST .../apply-setlist` = **Replace Event Plan from Setlist**; requires `expectedVersion`; if Event already has items, also `confirmReplace: true` else **409** (ADR-0021). Soft-deleted Arrangements in template → fail apply (400/409). Stale version → **409**.  
- Mutating root updates send `expectedVersion`; success responses include the **new** `version`; stale → **409** (never silent overwrite). See [`PERSISTENCE.md`](PERSISTENCE.md) §6.  
- CSRF: `X-CSRF-TOKEN` on POST/PUT/PATCH/DELETE; missing/invalid → **400** (ADR-0020).  
- OpenAPI when implemented. No bulk RPC bags.  
- Chart body format follows Q8; until then opaque string/blob on Arrangement.
