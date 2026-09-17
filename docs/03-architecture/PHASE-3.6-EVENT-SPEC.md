# Phase 3.6 Thin Event PATCH + cancel specification

**Status:** **COMPLETED** (T-3.6.01–03 shipped on `feature/phase-3.6-event-lifecycle`). Authorized 2026-09-17 (Kevin Esquivel).  
**Product bet:** After the dated Event exists (3.3) and people can RSVP (3.5), the Owner can **correct** title / type / startsAt and **cancel** (soft-hide) so the list stays the live plan — not a graveyard of mistyped rehearsals.  
**Develop reference:** `cbc88243c69d9676c672734a7846350395b178fe` (PR #10 merged).  
**Date:** 2026-09-17  
**Depends on:** ADR-0016, 0019–0023; Phase 3.3 Event create/list/get/apply; Phase 3.5 RSVP.

Accepted ADRs remain authoritative. This spec **narrows** the conceptual Event PATCH/cancel rows in [`API.md`](API.md). It does **not** reopen ADRs. It does **not** add location/notes UI, includeCancelled lists, hand-built plans, files, or SMTP.

---

## Product Goal

The organizer can fix a wrong time/title and take a cancelled gathering off the default Event list **without** hard-delete. Copied plan + RSVP rows stay on the Event (PERSISTENCE §8). Members never mutate Event metadata.

---

## User Journey

```text
OWNER
  Event detail
  → Edit title / type / startsAt (expectedVersion)
  → list and detail show the new values
  → Cancel event (confirm)
  → Event gone from default list
  → plan and RSVPs are not wiped

MEMBER
  sees updated title/time on live Events
  never sees Edit / Cancel
  cancelled Event URL → 404
```

---

## Frozen mechanics (thin defaults)

| ID | Decision for thin 3.6 |
| -- | --------------------- |
| Q-E1 | PATCH fields are **only** the create fields: `title`, `type`, `startsAt`. Location/notes stay unused. |
| Q-E2 | PATCH omitted or JSON `null` → keep (same as Song PATCH). Non-null applied. `expectedVersion` **required**. Success **200** Event detail + new `version`. Stale → **409**. |
| Q-E3 | Cancel is `POST .../events/{eventId}/cancel` with `{ expectedVersion }`. Success **204**. Sets `Status=cancelled`, `IsHidden=true`, `CancelledAt=now`, **Touch** (Version + UpdatedAt). Keep items + RSVPs. |
| Q-E4 | Already cancelled → **400**. Stale version → **409**. Member cancel → **403**. Non-member → **404**. Anon → **401**. |
| Q-E5 | Default list remains scheduled + not hidden for **Owner and Member**. No `includeCancelled` query in this slice. |
| Q-E6 | GET cancelled/hidden: **Owner 200**; **Member 404** (no existence leak for Members). |
| Q-E7 | PATCH or Apply on cancelled Event → **400**. RSVP already 404 (3.5 Q-A9) — do not reopen. |
| Q-E8 | **No new migration.** Status / IsHidden / CancelledAt already exist. |
| Q-E9 | Cancel button label **Cancel event**. Do not collide with form “Cancel” on create. Confirm dialog required. |

This freeze is a **thin product default**, not a new ADR.

---

## Scope

| Area | In |
| ---- | -- |
| PATCH | Owner `PATCH .../events/{eventId}` title/type/startsAt + expectedVersion |
| Cancel | Owner `POST .../events/{eventId}/cancel` + expectedVersion → 204 |
| Domain | `Event.UpdateMetadata`, `Event.Cancel` |
| AuthZ | Owner mutate; Member 403 on PATCH/cancel; non-member 404 |
| CSRF | PATCH and POST (ADR-0020) |
| UI | Event detail: Owner edit form + Cancel event confirm; list reflects PATCH; cancelled drops off list |
| E2E | TC-EVT-03: Owner PATCH title; cancel; event absent from list |

---

## Explicit Non-Scope

Location / notes fields · `includeCancelled` list · Owner cancelled-history page · un-cancel / restore · hard-delete Event · hand-built plan items · item PATCH · T-3.2.06 · SMTP · merge to `main` · exhaustive 409 Playwright matrix · changing RSVP semantics beyond Q-E7

---

## Existing Foundations

| Asset | State | Ticket action |
| ----- | ----- | ------------- |
| Event Title/Type/StartsAt + Version | Present | **Reuse** |
| Status / IsHidden / CancelledAt columns | Present | **Wire Cancel** — no migration |
| ListActiveByGroupAsync scheduled + !hidden | Present | **Keep** as the only list |
| BeginReplacePlan rejects cancelled | Present | **Keep** |
| RSVP 404 on cancelled/hidden | Present | **Keep** |
| Create UI fields | Present | **Mirror** on edit |

---

## API

All under `/api/groups/{groupId}`. Cookie + `X-CSRF-TOKEN` on PATCH/POST. Problem Details. JSON camelCase.

| Method | Route | AuthZ | Body | Success | Failures |
| ------ | ----- | ------ | ---- | ------- | -------- |
| PATCH | `.../events/{eventId}` | Owner | `{ expectedVersion, title?, type?, startsAt? }` | 200 Event detail | 401, 403, 404, 400, 409 |
| POST | `.../events/{eventId}/cancel` | Owner | `{ expectedVersion }` | 204 | 401, 403, 404, 400, 409 |

GET/list contracts from 3.3 stay, except Q-E6 (Member GET cancelled → 404).

---

## Domain / Application

- `Event.UpdateMetadata(title, type, startsAt, expectedVersion, now)` — normalize like Create; `EnsureExpectedVersion`; `Touch`; reject if cancelled (`InvalidOperationException` → 400).
- `Event.Cancel(expectedVersion, now)` — reject if already cancelled; `EnsureExpectedVersion`; set Status cancelled, IsHidden true, CancelledAt now; `Touch`.
- One `SaveChangesAsync` per PATCH or cancel.
- Map `ConcurrencyConflictException` → `ConflictException` (409).

---

## Authorization

| Actor | PATCH | Cancel | GET cancelled | List |
| ----- | ----- | ------ | ------------- | ---- |
| Anonymous | 401 | 401 | 401 | 401 |
| Non-member | 404 | 404 | 404 | 404 |
| Member | 403 | 403 | 404 | live only |
| Owner | 200 | 204 | 200 | live only |

---

## UI

- Event detail, Owner only: **Edit event** — Title, Type, Starts at (same controls as create). Save sends PATCH with `expectedVersion`. 409 → existing conflict UX.
- Owner: **Cancel event** (not the create-form Cancel). Confirm dialog. On 204, navigate to Events list. Event must not appear there.
- Member: no Edit / Cancel event. Still has Attendance (3.5) on live Events.
- English-first.

---

## Testing

| Layer | Focus |
| ----- | ----- |
| Domain | UpdateMetadata + Cancel; Version bump; already-cancelled reject; stale version |
| Application | Owner PATCH/cancel; Member 403; non-member 404; cancelled GET Owner vs Member |
| API | CSRF; 200/204; 409; 400 already cancelled |
| Playwright | **TC-EVT-03**: Owner creates Event (reuse helpers); PATCH title; list shows new title; Cancel event; list no longer has it |

Reuse e2e helpers. Full suite must stay green.

---

## Tickets

```text
T-3.6.01  Event PATCH + cancel Application + API
    │
    ▼
T-3.6.02  React Event edit + Cancel event UI
    │
    ▼
T-3.6.03  Sparse Playwright TC-EVT-03
```

Serial.

### T-3.6.01 — Application + API

| | |
|--|--|
| **Goal** | Productize Event metadata PATCH and cancel/soft-hide. |
| **Scope** | Domain methods; handlers; routes; AuthZ; CSRF; expectedVersion 409. |
| **Non-scope** | UI; Playwright; location/notes; includeCancelled. |
| **Tests** | Domain + Application + API as Testing table. |
| **Acceptance** | Owner PATCH title bumps Version; Owner cancel 204 hides from list; Member PATCH 403; Member GET cancelled 404; RSVP/Apply unchanged. |

### T-3.6.02 — React UI

| | |
|--|--|
| **Goal** | Owner can correct and cancel an Event without API tools. |
| **Scope** | Event detail edit + confirm cancel; conflict UX; Member hide controls. |
| **Non-scope** | Playwright; location/notes. |
| **Acceptance** | Demo: change time/title; cancel; list empty of that Event. |

### T-3.6.03 — Playwright

| | |
|--|--|
| **Goal** | CI proof of PATCH + cancel. |
| **Scope** | TC-EVT-03 only. |
| **Non-scope** | Member 403 E2E; 409 E2E matrix. |

---

## Exit

- Thin Event PATCH + cancel **COMPLETED** (T-3.6.01–03).
- Next work requires human decision / authorization. T-3.2.06 and SMTP remain deferred. No merge to `main`.
