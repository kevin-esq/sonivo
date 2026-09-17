# Phase 3.7 Thin People + Group lifecycle specification

**Status:** **COMPLETED** (T-3.7.01–03 on `feature/phase-3.7-people`). Authorized 2026-09-17 (Kevin Esquivel) — Gate A of [`SYSTEM-CLOSE-PLAN.md`](../01-product/SYSTEM-CLOSE-PLAN.md).  
**Product bet:** Invite without a roster is a dead end. Owner and Member can see **who is in the Group** and apply ADR-0013 lifecycle (remove / role / leave).  
**Date:** 2026-09-17  
**Depends on:** ADR-0005, 0006, 0012, 0013, 0019–0020; Phase 3.0 Group slice; Phase 3.4 invites.

Accepted ADRs remain authoritative. This spec **implements** the membership rows already in [`API.md`](API.md). It does **not** reopen ADRs. It does **not** add SMTP, invite list/revoke, Guest, or roster-on-item.

---

## Product Goal

After a second User joins via invite, both Owner and Member can open **People**, see display names and roles, and the Owner can remove or change role. A Member (or non-last Owner) can leave. The Owner can rename or soft-delete the Group from the shell.

---

## User Journey

```text
OWNER
  Group shell → People
  → sees Owner + Members
  → Remove member → they lose access (404)
  → Promote Member → Owner (multi-owner)
  → Rename group / Delete group (confirm, expectedVersion)

MEMBER
  People → sees the same roster (read)
  → Leave group → back to My groups; Group gone
  never sees Remove / role / Delete group
```

---

## Frozen mechanics (thin defaults)

| ID | Decision for thin 3.7 |
| -- | --------------------- |
| Q-P1 | List `GET .../members` → 200 `{ items: [{ userId, displayName, role, createdAt }] }` ordered by role Owner first, then displayName, then userId. |
| Q-P2 | Remove `DELETE .../members/{userId}` Owner only → **204**. Target missing → **404**. **Self-remove via DELETE → 400** (use Leave). Last Owner → **409**. |
| Q-P3 | Role `POST .../members/{userId}/role` body `{ role: "Owner" \| "Member" }` → **204**. Invalid role → **400**. Last Owner demote (self or other) → **409**. Target missing → **404**. |
| Q-P4 | Leave `POST .../leave` → **204**. Last Owner → **409**. Member always allowed. Empty Group forbidden because last Owner cannot leave. |
| Q-P5 | Non-member any of the above → **404**. Member mutating remove/role → **403**. Anon → **401**. |
| Q-P6 | CSRF on DELETE/POST (ADR-0020). |
| Q-P7 | Group rename/soft-delete: **reuse** existing PATCH/DELETE API; SPA only. Confirm dialog on delete. `expectedVersion` required. |
| Q-P8 | No new table. Memberships already persist. |
| Q-P9 | Display names from Identity `IUserDirectory` (same as RSVP list). |

This freeze is a **thin product default**, not a new ADR.

---

## Scope

| Area | In |
| ---- | -- |
| API | GET members, DELETE member, POST role, POST leave |
| Domain | `Membership.AssignRole` |
| AuthZ | ADR-0012/0013 |
| UI | People page; Group rename + Delete group; Leave |
| E2E | TC-PPL-01 Owner sees roster after invite; removes Member; Member cannot open Group |

---

## Explicit Non-Scope

SMTP · invite list/revoke · Guest · invite-as-Owner · roster-on-item · T-3.2.06 · Event location · merge `main` · UI redesign · exhaustive 409 Playwright matrix

---

## Tickets

| ID | Work |
| -- | ---- |
| T-3.7.01 | Domain + Application + API + tests |
| T-3.7.02 | React People + Group lifecycle chrome |
| T-3.7.03 | Sparse Playwright TC-PPL-01 |

---

## API

All under `/api/groups/{groupId}` except Leave is the same prefix. Cookie + `X-CSRF-TOKEN` on unsafe methods. Problem Details.

| Method | Route | AuthZ | Body | Success | Failures |
| ------ | ----- | ----- | ---- | ------- | -------- |
| GET | `.../members` | Member | — | 200 `{ items }` | 401, 404 |
| DELETE | `.../members/{userId}` | Owner | — | 204 | 401, 403, 404, 400, 409 |
| POST | `.../members/{userId}/role` | Owner | `{ role }` | 204 | 401, 403, 404, 400, 409 |
| POST | `.../leave` | Member | — | 204 | 401, 404, 409 |

---

## UI

- Nav: **People** next to Events.
- Owner: role `<select>` + **Remove**; **Rename group**; **Delete group** (dialog).
- Member: roster read-only + **Leave group**.
- After leave or delete: navigate to `/`.

---

## E2E

**TC-PPL-01:** Owner creates Group + invites; second user accepts; Owner opens People, sees both names; Owner removes Member; Member visiting the Group URL sees not-found.

---

## Out of ticket

SMTP (3.9) · invite revoke (3.8) · DataProtection (T-OPS-01)
