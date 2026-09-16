# NOW — agent focus

**Updated:** 2026-09-16

## Checkpoint state (required)

```text
Implementation: COMPLETE
Human approval: PENDING (documentation sync only — awaiting human review)
Git checkpoint: N/A (docs-only sync; no Git checkpoint pending for this work)
Remote: N/A
CI: PASSING (develop tip)
```

**Work type:** Phase 3.2 documentation sync only (no code).  
**Local checkout may remain:** `feature/phase-3.2-e2e` (do not change branch as part of this sync).  
**origin/develop:** `2022ce0e875e4f575c005b43a5cb0932bd7fa091`  
**origin/main:** `50adc009f1ca7c4a043bfc6f637a40251e1f205d` (unchanged)

## Phase 3.2 — approved scope CLOSED

Integrated on `develop` (`2022ce0`):

| Ticket | Status |
| ------ | ------ |
| T-3.2.01 Schema alignment | **COMPLETE** |
| T-3.2.02 Song CRUD | **COMPLETE** |
| T-3.2.03 Song soft-delete cascade | **COMPLETE** |
| T-3.2.04 Arrangement CRUD | **COMPLETE** |
| T-3.2.05 Link Resource CRUD | **COMPLETE** |
| T-3.2.07 React Library Shell | **COMPLETE** |
| T-3.2.08 Playwright (TC-LIB-01/02/03) | **COMPLETE** |
| T-3.2.06 File / blob / content | **DEFERRED** |

**Slice:** Song → Arrangement → Link Resource + React Library + sparse E2E.  
**Not in closed scope:** file Resource / `IBlobStore` / upload / download; Event / Setlist / RSVP product delivery.

**CI on develop:** Backend SUCCESS · Frontend SUCCESS · Playwright SUCCESS.

## Phase status

| Phase | Status |
| ----- | ------ |
| 0 Tooling & context | **CLOSED** |
| 1 Product & domain | **CLOSED** |
| 2.0–2.2 Technical ADRs/persistence | **CLOSED** |
| 2.3 Scaffold & foundation | **CLOSED** |
| 3.0 Group & Membership vertical slice | **CLOSED** |
| 3.0.1 Development infrastructure (Compose PostgreSQL) | **CLOSED** |
| 3.0.2 Engineering workflow & CI/CD foundation | **CLOSED** |
| 3.2 approved repertoire scope | **COMPLETED** |
| T-3.2.06 file/blob | **DEFERRED** |

## Authoritative contract

- Spec: `docs/03-architecture/PHASE-3.2-REPERTOIRE-SPEC.md`
- Nested Resource routes under Arrangement only
- Library UI: `/groups/:groupId/library` (Song / Arrangement / Link Resource)

## Firewall / next action

- **Next action requires HUMAN DECISION / AUTHORIZATION** (do not pick or implement a next ticket).
- Documented candidates when authorized later may include: T-3.2.06 (file/blob), Event / Setlist / RSVP, optional Q-R3 — none are authorized now.
- Do **not** commit / push / PR / merge this docs sync unless separately and explicitly authorized.
- Do **not** implement code, Setlist, Event, RSVP, invites, or file Resource without approval.
