# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-3.3.03)
Human approval: APPROVED (T-3.3.01–03 — Kevin Esquivel)
Git checkpoint: COMMITTED (01 @ 184518d · 02 @ 605b96a · 03 this commit)
Remote: NOT PUSHED
CI: NOT RUN
```

**Current ticket:** T-3.3.03 Apply Setlist → Event Plan  
**Branch:** `feature/phase-3.3-setlist-api`  
**Commits:** `184518da81b8bf9700f4feffe4d3469bfad38709` (01) · `605b96a4ab9d6bad60c69d8d013c006e78f65fd7` (02)

## Phase status

| Phase | Status |
| ----- | ------ |
| 3.2 approved repertoire scope | **COMPLETED** on develop |
| T-3.2.06 file/blob | **DEFERRED** |
| T-3.3.01 Setlist Application + API | **APPROVED — COMMITTED (local only)** |
| T-3.3.02 Event Application + API | **APPROVED — COMMITTED (local only)** |
| T-3.3.03 Apply Setlist → Event Plan | **APPROVED — committing** |
| T-3.3.04–05 | **NOT STARTED** |

## T-3.3.03 delivered

- `POST .../events/{eventId}/apply-setlist` (Owner; ADR-0021 Replace Event Plan)
- Copied `displaySongTitle` / `displayArrangementLabel` from live Song/Arr at apply time
- `sourceSetlistId` provenance; `confirmReplace`; empty Setlist → 400; soft-deleted Arr → 400
- One `IUnitOfWork` transaction; no migration; no UI

## Firewall

- Do **not** push / PR / merge unless separately authorized
- T-3.3.04–05 authorized in this director session (thin S2 only)
- No T-3.2.06 / RSVP / invites / files
