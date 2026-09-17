# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-3.3.01–05 thin S2)
Human approval: APPROVED (T-3.3.01–05 — Kevin Esquivel)
Git checkpoint: COMMITTED (01 @ 184518d · 02 @ 605b96a · 03 @ 68c260d · 04 @ b9df999 · 05 this commit)
Remote: NOT PUSHED
CI: NOT RUN
```

**Current ticket:** T-3.3.05 Sparse Playwright Owner journey  
**Branch:** `feature/phase-3.3-setlist-api`

## Phase status

| Phase | Status |
| ----- | ------ |
| 3.2 approved repertoire scope | **COMPLETED** on develop |
| T-3.2.06 file/blob | **DEFERRED** |
| T-3.3.01 Setlist Application + API | **APPROVED — COMMITTED (local only)** |
| T-3.3.02 Event Application + API | **APPROVED — COMMITTED (local only)** |
| T-3.3.03 Apply Setlist → Event Plan | **APPROVED — COMMITTED (local only)** |
| T-3.3.04 React Setlist + Event + Apply UI | **APPROVED — COMMITTED (local only)** |
| T-3.3.05 Sparse Playwright | **APPROVED — committing** |

## T-3.3.05 delivered

- TC-EVT-01: Owner Setlist → Event → Apply → copied plan labels
- TC-EVT-02: Setlist edit does not change Event plan until re-apply
- Full local Playwright suite: 9 passed
- Select label `Live arrangement` (avoids collision with heading Arrangements)

## Firewall

- Do **not** push / PR / merge unless separately authorized
- No T-3.2.06 / RSVP / invites / files
