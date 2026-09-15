# NOW — agent focus

**Updated:** 2026-09-15

## Checkpoint state (required)

```text
Implementation: COMPLETE
Human approval: APPROVED
Git checkpoint: PENDING
Remote: NOT PUSHED
CI: NOT RUN
```

**Pending checkpoint scope (batch candidate — explicit batch auth still required):**

- T-3.2.01 Schema alignment
- T-3.2.02 Song CRUD
- T-3.2.04 Arrangement CRUD
- T-3.2.03 Song soft-delete cascade
- T-3.2.05 Link Resource CRUD
- Docs sync (nested Resource routes + PATCH contract)
- Git workflow rule (this change — AGENTS.md / NOW)

Do **not** start large additional implementation indefinitely while `Git checkpoint: PENDING` without acknowledging this state. Prefer a dedicated Git checkpoint authorization (or an explicit batch commit auth) before T-3.2.07 unless the human overrides.

## Phase status

| Phase | Status |
| ----- | ------ |
| 0–3.1 | **CLOSED** |
| 3.2 backend T-3.2.01–05 | **COMPLETE** (approved; uncommitted) |
| Docs sync (nested Resource + PATCH) | **COMPLETE** |
| T-3.2.07 React library shell | **NEXT** — waiting authorization |
| T-3.2.06 file/blob | **DEFERRED** |
| T-3.2.08 Playwright | after T-3.2.07 |

## Authoritative contract

- Spec: `docs/03-architecture/PHASE-3.2-REPERTOIRE-SPEC.md`
- Summary: `docs/03-architecture/API.md`
- Resource routes: **nested** under Arrangement only
- Git lifecycle: `AGENTS.md` → Git checkpoint policy

## Firewall

- Do **not** implement T-3.2.07 until explicitly authorized.
- Do **not** commit/push/PR unless explicitly authorized (separate from ticket approval).
