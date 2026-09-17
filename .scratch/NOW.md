# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-3.3.04)
Human approval: APPROVED (T-3.3.01–04 — Kevin Esquivel)
Git checkpoint: COMMITTED (01 @ 184518d · 02 @ 605b96a · 03 @ 68c260d · 04 this commit)
Remote: NOT PUSHED
CI: NOT RUN
```

**Current ticket:** T-3.3.04 React Setlist + Event + Apply UI  
**Branch:** `feature/phase-3.3-setlist-api`  
**Commits:** `184518d` (01) · `605b96a` (02) · `68c260d` (03)

## Phase status

| Phase | Status |
| ----- | ------ |
| 3.2 approved repertoire scope | **COMPLETED** on develop |
| T-3.2.06 file/blob | **DEFERRED** |
| T-3.3.01 Setlist Application + API | **APPROVED — COMMITTED (local only)** |
| T-3.3.02 Event Application + API | **APPROVED — COMMITTED (local only)** |
| T-3.3.03 Apply Setlist → Event Plan | **APPROVED — COMMITTED (local only)** |
| T-3.3.04 React Setlist + Event + Apply UI | **APPROVED — committing** |
| T-3.3.05 Sparse Playwright | **NEXT** |

## T-3.3.04 delivered

- Group shell links: Library / Setlists / Events
- Setlist list/create/detail: pick live Arrs, move up/down, save full replace, rename
- Event list/create/detail; datetime-local → UTC `startsAt`
- Apply + confirmReplace dialog; plan shows copied labels
- Owner mutate / Member hide (Library pattern); 409 `CONFLICT_MESSAGE`

## Firewall

- Do **not** push / PR / merge unless separately authorized
- No T-3.2.06 / RSVP / invites / files
