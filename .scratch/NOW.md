# NOW — agent focus

**Updated:** 2026-09-15

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

## Just done

- Public repo + CI audit; GitHub Actions run `34960571971` verified success (including Playwright **4 passed**)
- Branch protection verified on `main`/`develop`
- CI hardening: explicit `permissions: contents: read` + `actions: write` (PR)

## Remaining blockers (human)

1. Merge PR for CI permissions hardening when checks are green
2. Explicit approval for next product phase (Song / Arrangement / …)

## GitHub

- Remote: https://github.com/kevin-esq/sonivo (public)
- Branches: `main`, `develop` protected (required CI checks; no force-push/delete)
