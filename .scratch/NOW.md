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

## Just done

- Git initialized (`main` + `develop`); no GitHub remote yet (human action)
- Playwright E2E under `e2e/` (auth + groups critical paths)
- GitHub Actions CI: backend + frontend + Playwright
- PR template; TESTING.md / README / AGENTS workflow docs

## Remaining blockers (human)

1. Create GitHub repository + configure remote + push
2. Branch protection on `main` / `develop` (optional but recommended)
3. Explicit approval for next product phase (Song / Arrangement / …)

## Do not

Implement Song/Arrangement/Resource/Setlist/Event/RSVP/invites without approval. Do not push or create GitHub remotes without authorization.
