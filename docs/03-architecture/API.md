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

| Use case | Method | Route | AuthZ | Notes | Success | Failures |
| -------- | ------ | ----- | ----- | ----- | ------- | -------- |
| List Songs | GET | `.../songs` | Member | Exclude soft-deleted | 200 | 404 |
| Create Song | POST | `.../songs` | Owner | Creates Default Arrangement (assumption) | 201 | 403, 400 |
| Get Song | GET | `.../songs/{songId}` | Member | | 200 | 404 |
| Update Song | PATCH | `.../songs/{songId}` | Owner | Identity fields | 200 | 403, 404, 409 |
| Soft-delete Song | DELETE | `.../songs/{songId}` | Owner | Soft | 204 | 403, 404 |
| List Arrangements | GET | `.../songs/{songId}/arrangements` or `.../arrangements` | Member | | 200 | 404 |
| Create Arrangement | POST | `.../songs/{songId}/arrangements` | Owner | | 201 | 403, 400 |
| Get Arrangement | GET | `.../arrangements/{arrangementId}` | Member | Includes resources metadata | 200 | 404 |
| Update Arrangement | PATCH | `.../arrangements/{arrangementId}` | Owner | Musical body | 200 | 403, 404, 409 |
| Soft-delete Arrangement | DELETE | `.../arrangements/{arrangementId}` | Owner | Allow last (0017) | 204 | 403, 404, 409 |
| Set default | POST | `.../arrangements/{arrangementId}/default` | Owner | Tx | 204 | 409 |
| Add Resource | POST | `.../arrangements/{arrangementId}/resources` | Owner | multipart or init+upload | 201 | 403, 400 |
| Delete Resource | DELETE | `.../resources/{resourceId}` | Owner | Hard | 204 | 403, 404 |
| Download Resource | GET | `.../resources/{resourceId}/content` | Member | Redirect signed URL or stream | 200/302 | 403, 404 |

All `...` = `/api/groups/{groupId}`.

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
