# Phase 3.5 Thin RSVP specification

**Status:** **COMPLETED** on `develop` (PR [#10](https://github.com/kevin-esq/sonivo/pull/10), merge `cbc8824`). T-3.5.01–03 shipped. Authorized 2026-09-17 (Kevin Esquivel).  
**Product bet:** After a second person can join (Phase 3.4), Members (and Owners) can signal **yes / no / maybe** on a dated Event so the organizer knows who is coming.  
**Develop reference:** `cbc88243c69d9676c672734a7846350395b178fe` (PR #10 merged).  
**Date:** 2026-09-17  
**Depends on:** ADR-0006, 0012, 0016–0018, 0019–0020; Phase 3.3 Event plan; Phase 3.4 thin invites.

Accepted ADRs remain authoritative. This spec **narrows** the conceptual RSVP surface in [`API.md`](API.md) and [`PERSISTENCE.md`](PERSISTENCE.md) §14. It does **not** reopen ADRs. It does **not** add email, roster-on-item, or Event cancel.

---

## Product Goal

Close the remaining hole in **prepare the next musical event**: the copied plan exists and a Member can read it; the Group still cannot record attendance. Thin RSVP is that signal — not notifications, not “who sings this song.”

---

## User Journey

```text
OWNER
  Event detail (plan already applied from 3.3)
  → sees Attendance list
  → can set own Yes / No / Maybe

MEMBER (joined via 3.4 invite)
  Event detail → read plan (unchanged)
  → set own Yes / No / Maybe  (intentional Member write; ADR-0012 / PERSONAS)
  → sees the same Attendance list
  → still no Apply / Add setlist / Add song
```

---

## Frozen mechanics (thin defaults)

| ID | Decision for thin 3.5 |
| -- | --------------------- |
| Q-A1 | Responses are **`yes` \| `no` \| `maybe`** — reuse existing `CK_Rsvps_Response`. Do **not** invent `going` / `not going` strings. |
| Q-A2 | JSON field name is **`response`** (domain/persistence). API.md’s word “status” is **not** the body field (that word is Event.Status). |
| Q-A3 | AuthZ is **any Group membership** (`RequireMemberAsync`): Owner **and** Member role. Non-member → **404**. Anon → **401**. |
| Q-A4 | PUT upserts **the caller’s own** row only. Unique `(EventId, UserId)`. Cannot set another user’s RSVP. |
| Q-A5 | PUT does **not** bump Event `Version` or Event `UpdatedAt`. Only `Rsvp.UpdatedAt` changes (PERSISTENCE §14 / §16). |
| Q-A6 | **No new migration.** `Rsvps` table + entity already exist from foundation. |
| Q-A7 | GET list includes **`displayName`** (Identity `DisplayName`; if null/blank, fallback **email**). Application uses a small user-directory **port** — no Identity types in Domain/Application. |
| Q-A8 | No email, SMTP, WhatsApp, or in-app notifications. |
| Q-A9 | Hidden or cancelled Event → **404** (do not leak). Scheduled live Events only. |
| Q-A10 | Member Event chrome stays read-only for **plan mutate**; RSVP controls are **visible and usable** for Members. |

This freeze is a **thin product default**, not a new ADR.

---

## Scope

| Area | In |
| ---- | -- |
| Upsert | `PUT /api/groups/{groupId}/events/{eventId}/rsvp` → 200 own row |
| List | `GET /api/groups/{groupId}/events/{eventId}/rsvps` → 200 `{ items }` |
| Domain | `Event.SetRsvp(userId, response, now)` upsert on the Event collection |
| Persistence | Reuse `Rsvps`; store methods on Event store (or dedicated RSVP store) |
| AuthZ | Member-or-Owner; CSRF on PUT (ADR-0020) |
| UI | Event detail Attendance: own Yes/No/Maybe + named list |
| E2E | Member RSVPs yes; Owner sees that name + Yes |

---

## Explicit Non-Scope

Email / SMTP / WhatsApp · notifications · Event PATCH / cancel / location / notes · hand-built Event plans · roster-on-item / “who sings this song” · Member list page · remove/promote/leave · maybe-as-required product debate (maybe is **allowed** because the check constraint already has it) · file/blob T-3.2.06 · invite list/revoke · expectedVersion on RSVP · Event.Version bump on RSVP · new roles · exhaustive 409/CSRF Playwright matrix

---

## Existing Foundations

| Asset | State | Ticket action |
| ----- | ----- | ------------- |
| `Rsvp` entity + `RsvpResponses` + `Event.Rsvps` | Present | **Reuse** — add factory/upsert on Event |
| `Rsvps` table, unique `(EventId, UserId)`, CK yes/no/maybe | Present | **Reuse — no migration** |
| Event Application/API/UI (3.3) | Shipped | **Extend** |
| Invite join (3.4) | Shipped | **Reuse** for Member E2E seed |
| `RequireMemberAsync` | Present | **Use** for both PUT and GET |

**Foundation vs ADR:** No conflict. Persistence already matches ADR-0016 attendance signal. No new ADR required.

---

## API

All under `/api/groups/{groupId}`. Cookie + `X-CSRF-TOKEN` on PUT. Problem Details. JSON camelCase.

| Method | Route | AuthZ | Body | Success | Failures |
| ------ | ----- | ----- | ---- | ------- | -------- |
| PUT | `.../events/{eventId}/rsvp` | Member (any membership) | `{ "response": "yes"\|"no"\|"maybe" }` | 200 `{ userId, response, updatedAt }` | 401, 400, 404 |
| GET | `.../events/{eventId}/rsvps` | Member (any membership) | — | 200 `{ "items": [ { userId, displayName, response, updatedAt } ] }` | 401, 404 |

Rules:

- Unknown / invalid / missing `response` → **400**.
- Event not in Group, not found, hidden, or cancelled → **404**.
- Non-member → **404** (no existence leak).
- Anonymous → **401**.
- Upsert is idempotent: second PUT with a different response updates the same row.
- GET list order: `displayName` ascending, then `userId`. Empty `items` is valid.
- GET does not include Group members who have not RSVPed (no implied `unanswered` rows).

---

## Domain / Application

- `Event.SetRsvp(Guid userId, string response, DateTimeOffset now)`:
  - Validate response via `RsvpResponses` (`yes`/`no`/`maybe`).
  - If a row for `userId` exists, update `Response` + `UpdatedAt`.
  - Else add a new `Rsvp` (`Id` new Guid, `EventId`, `UserId`, `Response`, `UpdatedAt`).
  - Do **not** change Event `Version`, `UpdatedAt`, Title, or Items.
- Load Event **with Rsvps** for PUT (or load/upsert RSVP scoped by EventId after verifying Event).
- One `SaveChangesAsync` per PUT.
- List: verify Event via membership + live Event; query RSVPs for that Event; join display names through `IUserDirectory` (name the port as needed) returning `{ UserId, DisplayName }` where DisplayName is Identity display name or email fallback.
- Do not put `GroupId` on `Rsvp` (PERSISTENCE: no tenant column on RSVP). Tenancy is Event.GroupId + membership check.

---

## Authorization

| Actor | PUT own RSVP | GET list |
| ----- | ------------ | -------- |
| Anonymous | 401 | 401 |
| Non-member | 404 | 404 |
| Member | 200 | 200 |
| Owner | 200 | 200 |

Membership from server session. Never trust client tenant ids (ADR-0019).

---

## UI

- Event detail: **Attendance** section below the plan.
- Own response: three controls labeled **Yes**, **No**, **Maybe** (English-first). Selected state reflects the current user’s row (none selected if no row).
- List: each item shows `displayName` and response. Empty copy: **No responses yet.**
- Owner **and** Member see and use the same RSVP controls.
- Member still must not see Apply setlist / Add setlist / Add song / Invite member.

---

## Testing

| Layer | Focus |
| ----- | ----- |
| Domain | SetRsvp insert + update; reject invalid response; Event.Version unchanged |
| Application | Owner and Member upsert; non-member 404; cancelled/hidden 404; list displayName fallback; one SaveChanges |
| API | CSRF on PUT; 401; 400 invalid body; 200 upsert; GET list |
| Playwright | **TC-RSVP-01**: Owner Event with plan; invite Member; Member sets Yes; Owner sees that Member’s display name and Yes |

Reuse e2e invite + scheduling helpers. Full suite must stay green. No exhaustive CSRF/409 Playwright matrix.

---

## Tickets

```text
T-3.5.01  RSVP Application + API
    │
    ▼
T-3.5.02  React Event Attendance UI
    │
    ▼
T-3.5.03  Sparse Playwright Member RSVP (TC-RSVP-01)
```

Serial. Do not start 02 before 01; 03 before 02.

### T-3.5.01 — RSVP Application + API

| | |
|--|--|
| **Goal** | Productize Event attendance upsert + list. |
| **Scope** | Domain SetRsvp; handlers; PUT/GET routes; AuthZ; CSRF; user-directory port for list names. |
| **Non-scope** | UI; Playwright; Event cancel; migration unless a real mapping defect is proven. |
| **Tests** | Domain + Application + API as Testing table. |
| **Acceptance** | Member and Owner can PUT `yes`; replay with `no` updates one row; GET lists displayName; Event.Version unchanged; non-member 404. |

### T-3.5.02 — React Attendance UI

| | |
|--|--|
| **Goal** | Owner and Member can set and see RSVPs on Event detail without API tools. |
| **Scope** | Event detail Attendance; client PUT/GET; Member can write RSVP; plan mutate still Owner-only. |
| **Non-scope** | Playwright; notifications; member roster page. |
| **Acceptance** | Clicking Yes persists and remains selected after reload; list shows names. |

### T-3.5.03 — Playwright

| | |
|--|--|
| **Goal** | CI proof Member consume + attendance signal. |
| **Scope** | One journey TC-RSVP-01 (invite seed + RSVP yes + Owner sees it). |
| **Non-scope** | Maybe/No matrix; cancel; files. |

---

## Exit

- Thin RSVP **COMPLETED** on `develop` (PR #10, merge `cbc8824`). Tickets T-3.5.01–03 closed.
- Next is Phase 3.6 thin Event PATCH/cancel (T-3.6.01–03) per [`PHASE-3.6-EVENT-SPEC.md`](PHASE-3.6-EVENT-SPEC.md). T-3.2.06 and SMTP remain deferred. No merge to `main`.
