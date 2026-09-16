# NOW — agent focus

**Updated:** 2026-09-16

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-3.3.02)
Human approval: APPROVED (T-3.3.01 + T-3.3.02 — Kevin Esquivel)
Git checkpoint: COMMITTED (01 @ 184518d · 02 @ PENDING)
Remote: NOT PUSHED
CI: NOT RUN
```

**Current ticket:** T-3.3.02 Event Application + API (checkpoint)  
**Branch:** `feature/phase-3.3-setlist-api`  
**Base / T-3.3.01 commit:** `origin/develop` @ `53e9ca1` · local `184518da81b8bf9700f4feffe4d3469bfad38709`

## Phase status

| Phase | Status |
| ----- | ------ |
| 3.2 approved repertoire scope | **COMPLETED** on develop |
| T-3.2.06 file/blob | **DEFERRED** |
| T-3.3.01 Setlist Application + API | **APPROVED — COMMITTED (local only)** |
| T-3.3.02 Event Application + API | **APPROVED — COMMITTED (local only)** |
| T-3.3.03–05 | **NOT STARTED** |

## T-3.3.02 delivered

- Event domain `Create` (title/type/startsAt → scheduled)
- Application create/list/get + `IEventStore` / `EfEventStore`
- API: POST/GET list/GET detail under `/api/groups/{groupId}/events`
- Plan items from copied labels only (empty until Apply)
- **No Apply / PATCH / cancel / RSVP / UI / migration**

## Firewall

- Do **not** implement T-3.3.03+ until authorized
- Do **not** push / PR unless separately authorized
