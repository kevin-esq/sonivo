# Phase 3.4 Thin invites specification

**Status:** **COMPLETED** on `develop` (PR [#8](https://github.com/kevin-esq/sonivo/pull/8), merge `8db0714`). T-3.4.01–03 shipped.  
**Product bet:** Owner can add a Member via a shareable invite link so that Member can **read** the live Library + copied Event Plan (ADR-0006).  
**Develop reference:** `8db0714e03f302dff1e32ed644b794f595a99175` (PR #8 merged).  
**Date:** 2026-09-17  
**Depends on:** ADR-0005, 0006, 0012, 0013, 0019–0020; Phase 3.3 thin S2 (Setlist → Event apply).

Accepted ADRs remain authoritative. This spec **narrows** the conceptual invite surface in [`API.md`](API.md). It does **not** reopen ADRs. It **freezes** “invite mechanics (email vs link)” **for this thin slice only**.

---

## Product Goal

An Owner preparing the next musical event can bring a second person into the Group without SQL. That Member can open Setlists and Events and see the copied plan **without mutate controls**.

---

## User Journey

```text
OWNER
  Group shell → Invite member → copy accept URL
  (already has Library / Setlist / Event plan from 3.3)

INVITEE
  Register or log in (existing Identity cookie)
  → open /join/{token}
  → Accept
  → Group appears as Member (read-only)
  → open Event plan; no Add setlist / Apply / Add song
```

---

## Frozen mechanics (thin defaults)

| ID | Decision for thin 3.4 |
| -- | --------------------- |
| Q-I1 | **Shareable link**, not email/SMTP/WhatsApp. No outbound mail. |
| Q-I2 | Invitee must be an **authenticated User**. Register/login first, then accept. |
| Q-I3 | Accept creates **Member** only (never Owner). |
| Q-I4 | Token is **unguessable**, shown **once** at create; store **hash** only. |
| Q-I5 | Token **expires in 7 days**; single-use. No client-chosen TTL. |
| Q-I6 | Already a member of that Group → **409**. Expired / used / unknown token → **400**. |
| Q-I7 | Routes follow [`API.md`](API.md): `POST .../invitations`, `POST /api/invitations/{token}/accept`. |
| Q-I8 | Accept returns **200** `{ groupId, role: "Member" }` (not 204) so the SPA can navigate. |

This freeze is a **thin product default**, not a new ADR. Email invites remain FUTURE.

---

## Scope

| Area | In |
| ---- | -- |
| Create invite | Owner `POST /api/groups/{groupId}/invitations` → 201 `{ id, token, expiresAt }` |
| Accept | Authenticated `POST /api/invitations/{token}/accept` → 200 `{ groupId, role: "Member" }` |
| Persistence | `Invitations` table + EF migration |
| AuthZ | Owner create; Member create → 403; non-member → 404; anon → 401 |
| CSRF | POST verbs (ADR-0020) |
| UI | Owner “Invite member” + copyable URL; `/join/:token` accept screen |
| E2E | Owner invite → second user accept → Member sees Event plan, no mutate chrome |

---

## Explicit Non-Scope

Email / SMTP · notifications · WhatsApp · invite-as-Owner · list/revoke invites · Member list UI · remove / promote / demote / leave · Guest role · RSVP · file/blob (T-3.2.06) · Event PATCH/cancel · hand-built Event plans

---

## API

All mutating routes: cookie + `X-CSRF-TOKEN`. Problem Details.

| Method | Route | AuthZ | Body | Success | Failures |
| ------ | ----- | ----- | ---- | ------- | -------- |
| POST | `/api/groups/{groupId}/invitations` | Owner | `{}` | 201 `{ id, token, expiresAt }` | 401, 403, 404, 400 |
| POST | `/api/invitations/{token}/accept` | Authenticated | — | 200 `{ groupId, role }` | 401, 400, 409 |

`token` in the accept path is the **plaintext** token from create (not the hash, not the invitation id).

---

## Domain / persistence

New aggregate/entity **Invitation** (Group-scoped):

- `Id`, `GroupId`, `TokenHash` (unique), `CreatedByUserId`, `CreatedAt`, `ExpiresAt`
- `AcceptedAt` nullable, `AcceptedByUserId` nullable
- Role implied **Member** (do not persist other roles)

Rules:

- Soft-deleted Group → create/accept fail **404** (no existence leak on create; accept 400 if token invalid **or** group gone — do not leak group id on accept failure).
- Accept: hash token → load invitation → not expired → not accepted → Group live → user has no Membership → insert `Membership.CreateMember` + mark accepted. **One** `IUnitOfWork` transaction.
- Token generate: ≥128 bits CSPRNG; persist SHA-256 hex/bytes of UTF-8 token.

No other schema changes.

---

## Authorization

| Actor | Create invite | Accept |
| ----- | ------------- | ------ |
| Anonymous | 401 | 401 |
| Non-member | 404 | 400 if token bad; if valid, join as Member |
| Member | 403 | 409 (already in group) |
| Owner | 201 | 409 (already in group) |

Membership from server session. Never trust client tenant ids (ADR-0019).

---

## UI

- Group shell: Owner-only **Invite member**. After create, show the accept URL (`{origin}/join/{token}`) and a copy control. Member does not see the button.
- `/join/:token`: if logged out, send to `/login` (preserve return to `/join/:token`). If logged in, show “Join this group” + Accept; on 400 show generic invalid/expired; on 409 show already a member + link home.
- After **200** `{ groupId, role }`, navigate to `/groups/{groupId}`.

---

## Testing

| Layer | Focus |
| ----- | ----- |
| Application | Owner-only create; hash stored not plaintext; expiry; single-use; already-member 409; one transaction |
| API | CSRF; 401/403/404; accept 200 |
| Playwright | TC-INV-01: Owner creates invite; second user registers, accepts, opens Event plan, no Owner mutate buttons |

Reuse e2e helpers. Full suite must stay green.

---

## Tickets

```text
T-3.4.01  Invitation Application + API + migration
    │
    ▼
T-3.4.02  React invite + join UI
    │
    ▼
T-3.4.03  Sparse Playwright Member join + read plan
```

Serial. Do not start 02 before 01; 03 before 02.

### T-3.4.01 — Invitation Application + API

| | |
|--|--|
| **Goal** | Productize Group invite create/accept. |
| **Scope** | Entity + migration; create; accept; AuthZ; CSRF; hashed token; 7-day expiry; Member-only. |
| **Non-scope** | UI; email; list/revoke; role change. |
| **Tests** | Application + API as Testing table. |
| **Acceptance** | Owner creates token; other User accepts once → Membership Member and **200** `{ groupId, role: "Member" }`; replay 400; already-in-group 409. |

### T-3.4.02 — React invite UI

| | |
|--|--|
| **Goal** | Owner copies a join URL; invitee accepts in the browser. |
| **Scope** | Group shell Invite; `/join/:token`; cookie/CSRF client reuse; Member hide invite button. |
| **Non-scope** | Playwright; member roster; email. |
| **Acceptance** | Owner can demo join without API tools. |

### T-3.4.03 — Playwright

| | |
|--|--|
| **Goal** | CI proof Member consume. |
| **Scope** | One journey: invite → accept → Event plan visible; mutate controls absent. Seed Library/Setlist/Event in the same test (reuse 3.3 helpers). |
| **Non-scope** | RSVP; 409 matrix; email. |

---

## Exit

- Thin invites **COMPLETED** on `develop` (PR #8, merge `8db0714`). Tickets T-3.4.01–03 closed.
- Next authorized implementation: Phase 3.5 thin RSVP ([`PHASE-3.5-RSVP-SPEC.md`](PHASE-3.5-RSVP-SPEC.md)). T-3.2.06 and Event cancel-PATCH remain deferred. No SMTP.
