# AGENTS.md — Sonivo

Operating rules for AI agents and developers in this repository.

This file is **not** the product requirements document. Product truth lives under `docs/`.

---

## Phase gate (hard)

**Phase 0 is CLOSED.** **Phase 1 — product & domain specification is CLOSED** (ADR-0015–0018 HUMAN-ACCEPTED).  
**Phase 2.0–2.2 technical specification is CLOSED** (ADR-0019–0023 HUMAN-ACCEPTED).  
**Phase 2.3 scaffold & foundation is CLOSED.**  
**Phase 3.0 Group & Membership vertical slice is CLOSED.**  
**Phase 3.0.1 development infrastructure (local PostgreSQL Compose) is CLOSED.**  
**Phase 3.0.2 engineering workflow & CI/CD foundation is CLOSED.**

ADRs **0001–0023** are **ACCEPTED** (including tooling ADR-0002).

Until the user explicitly approves the **next** product phase:

- Do **not** implement Song/Arrangement/Resource/Setlist/Event/RSVP/invites or other non-Group features
- Do **not** install skills or non-stack tooling without approval
- Do **not** push / create GitHub remotes / change branch protection unless explicitly authorized
- Foundation + Group/Membership + engineering workflow maintenance is allowed within accepted architecture
- Local PostgreSQL: repository `compose.yaml` (host port **5433**)

---

## Before doing anything

1. Read [`docs/00-context/CONTEXT.md`](docs/00-context/CONTEXT.md).
2. Read **ACCEPTED** entries in [`docs/03-architecture/DECISIONS.md`](docs/03-architecture/DECISIONS.md).
3. Do not reopen ACCEPTED ADRs 0001–0023 without a superseding ADR.
4. Do not invent FUTURE features or prematurely “solve” Q8–Q11.
5. Check [`docs/tooling/TOOLING-AUDIT.md`](docs/tooling/TOOLING-AUDIT.md) for the **AUTHORIZED** project-local allowlist (**ADR-0002 ACCEPTED**). Present tooling ≠ authorized.

---

## Source-of-truth hierarchy

1. `docs/00-context/CONTEXT.md`
2. `docs/03-architecture/DECISIONS.md` — **ACCEPTED** only bind
3. `docs/01-product/*`
4. `docs/02-domain/*`
5. `docs/03-architecture/ARCHITECTURE.md`
6. Specs/tickets (when they exist)
7. Conversation history — ephemeral

---

## Development principles

- Docs-first; ticketed implementation; explicit scope approval
- TDD (RED → GREEN → REVIEW); behavior-focused tests
- Security-first tenancy: CLIENT-SUPPLIED GROUP ID ≠ AUTHORIZATION
- No silent architectural changes; stop and report ADR conflicts
- No unnecessary dependencies; no scope creep
- Never claim tests passed if they were not actually run

## Git

- Branches: `main` (stable), `develop` (integration), `feature/*`, `fix/*`, `chore/*`, `docs/*`
- Feature work branches from `develop` and merges back via PR — not onto `main` directly
- Conventional Commits (`feat`, `fix`, `test`, `docs`, `chore`, …)
- PRs use `.github/pull_request_template.md`; CI must be green before merge
- Details: [`README.md`](README.md)

## Testing

Pyramid + Playwright policy: [`docs/03-architecture/TESTING.md`](docs/03-architecture/TESTING.md).

Critical journeys live in `e2e/` and must hit the real React → API → Identity cookie → PostgreSQL path.

## Binding ACCEPTED decisions (do not reinterpret)

- Group tenancy; Owner\|Member; multi-owner lifecycle; soft-delete (0005, 0012, 0013)
- Song work vs Arrangement realization (separate aggregate); Resources on Arrangement (0007, 0008, 0014)
- Identity + HTTP-only cookie; same-site SPA+API; API first-class; no web JWT/BFF (0009, 0011)
- Stack: React/Vite/TS/Tailwind + ASP.NET + EF + Postgres (0010)
- Organizer persona → Owner role; Member first-class read UX (0006, 0012)
- Phase 1 MVP spine & semantics (0015–0018)
- Phase 2.1 security/workflow (0019–0021): antiforgery CSRF; Replace Event Plan + `confirmReplace`
- Phase 2.2 persistence (0022–0023): composite tenant FKs; soft-delete filters; integer `Version` → 409

---

## Documentation rules

- Labels: **FACT** | **ASSUMPTION** | **OPEN QUESTION** | **PROHIBITION** | **FUTURE**
- ADR status: **PROPOSED** | **ACCEPTED** | **SUPERSEDED**
- Do not create empty docs to fill the tree

---

## Engineering discipline (when implementation is approved)

- Ubiquitous language from glossary/domain docs
- Server-side AuthZ; never trust client tenant ids
- Authorize file access; CSRF per ADR-0020
- No speculative microservices/CQRS/event sourcing
- No secrets in git

---

## Agent behavior

- Inspect before changing; respect accepted ADRs; stop on conflicts
- Avoid installing unnecessary tools; avoid unrelated file churn
- Report exact validation results
- Do not invent product scope beyond the authorized phase

---

## Tooling

Authoritative policy: [`docs/tooling/TOOLING-AUDIT.md`](docs/tooling/TOOLING-AUDIT.md) and **ADR-0002 (ACCEPTED)**.

- **AUTHORIZED project-local:** CORE + SPECIALIZED allowlist only (14 skill directories). Inventory: [`docs/tooling/SKILLS-INVENTORY.md`](docs/tooling/SKILLS-INVENTORY.md).
- **PRESENT ≠ AUTHORIZED.** User-global ambient tooling must **not** become a Sonivo dependency.
- Do not install further skills/tooling without explicit approval.
