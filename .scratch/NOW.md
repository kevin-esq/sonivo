# NOW — agent focus

**Updated:** 2026-09-15

## Checkpoint state (required)

```text
Implementation: COMPLETE
Human approval: APPROVED
Git checkpoint: COMMITTED
Remote: NOT PUSHED
CI: NOT RUN
```

**Current ticket:** T-3.2.07 React Library Shell  
**Local commit:** `feat(repertoire): implement React library shell` (this checkpoint)  
**Branch:** `feature/phase-3.2-repertoire`  
**Phase 3.2 backend on develop:** squash merge of PR #2 (`45110d2`)

**Included in this checkpoint:**

- T-3.2.07 React Library Shell (Song / Arrangement / Link Resource UI)
- Review findings accepted as non-blocking (no fix cycle)

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
| 3.2 backend T-3.2.01–05 | **COMPLETE** (merged to `develop`) |
| T-3.2.06 file/blob | **DEFERRED** |
| T-3.2.07 React library shell | **APPROVED — local Git checkpoint COMPLETE** |
| T-3.2.08 Playwright library journey | **NOT STARTED** (do not implement until authorized) |

## Authoritative contract

- Spec: `docs/03-architecture/PHASE-3.2-REPERTOIRE-SPEC.md`
- Nested Resource routes under Arrangement only
- T-3.2.07: `/groups/:groupId/library` + Song / Arrangement / Link Resource UI

## Firewall

- Do **not** implement T-3.2.08 / file Resource / Setlist / Event without authorization
- Do **not** push / create PR / merge unless separately and explicitly authorized
