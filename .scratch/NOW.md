# NOW — agent focus

**Updated:** 2026-09-15

## Checkpoint state (required)

```text
Implementation: COMPLETE
Human approval: APPROVED
Git checkpoint: COMMITTED
Remote: PUSHED
CI: NOT RUN
```

**Committed on:** `feature/phase-3.2-repertoire` @ `50518d9`  
**PR:** #2 → `develop` (OPEN; updating from `origin/develop` after PR #1 merge)

**Included in checkpoint:**

- T-3.2.01 Schema alignment
- T-3.2.02 Song CRUD
- T-3.2.04 Arrangement CRUD
- T-3.2.03 Song soft-delete cascade
- T-3.2.05 Link Resource CRUD
- Docs sync (nested Resource routes + PATCH contract)
- Git workflow rule (`AGENTS.md` / README / scratch rule)

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
| 3.0.2.1 Public repository & CI audit | **CLOSED** |
| 3.2 backend T-3.2.01–05 | **COMPLETE** (in PR #2) |
| Docs sync (nested Resource + PATCH) | **COMPLETE** |
| T-3.2.06 file/blob | **DEFERRED** |
| T-3.2.07 React library shell | **NEXT** — after PR #2; waiting authorization |
| T-3.2.08 Playwright | after T-3.2.07 |

## Authoritative contract

- Spec: `docs/03-architecture/PHASE-3.2-REPERTOIRE-SPEC.md`
- Summary: `docs/03-architecture/API.md`
- Resource routes: **nested** under Arrangement only
- Git lifecycle: `AGENTS.md` → Git checkpoint policy

## GitHub / CI (from develop)

- Remote: https://github.com/kevin-esq/sonivo (public)
- Branches: `main`, `develop` protected (required CI checks; no force-push/delete)
- PR #1 CI permissions hardening **MERGED** into `develop` (`2c9e9e0`)
- CI hardening: explicit `permissions: contents: read` + `actions: write`
- Earlier CI audit run `34960571971` verified success (including Playwright **4 passed**)

## Firewall

- Do **not** merge/approve PR #2 until CI is green and human review authorizes it.
- Do **not** implement T-3.2.07 until explicitly authorized.
- Do **not** commit/push/PR for new work unless explicitly authorized (separate from ticket approval).
