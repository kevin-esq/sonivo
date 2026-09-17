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
**Phase 3.0.3 Resource & rehearsal domain clarification is CLOSED** (ADR-0024 HUMAN-ACCEPTED).  
**Phase 3.1 Song & Arrangement domain specification is CLOSED** (ADR-0025 HUMAN-ACCEPTED).

ADRs **0001–0025** are **ACCEPTED** (including tooling ADR-0002).  
**Phase 3.2 approved scope:** **COMPLETED** (T-3.2.01–05, 07, 08) — `Song → Arrangement → Link Resource` + React Library Shell + sparse Playwright ([`PHASE-3.2-REPERTOIRE-SPEC.md`](docs/03-architecture/PHASE-3.2-REPERTOIRE-SPEC.md)). Nested Resource routes are authoritative. File Resource / blob / `content` (**T-3.2.06**) remains **DEFERRED** (not automatic next).  
**Phase 3.3 thin S2:** **CLOSED** (T-3.3.01–05) — Setlist → Event apply → React UI → Playwright ([`PHASE-3.3-THIN-SPEC.md`](docs/03-architecture/PHASE-3.3-THIN-SPEC.md)). Merged to `develop` (PR [#6](https://github.com/kevin-esq/sonivo/pull/6), `80f5f63`).  
**Phase 3.4 thin invites:** **CLOSED** / **COMPLETED** (T-3.4.01–03) — link token, no email ([`PHASE-3.4-INVITE-SPEC.md`](docs/03-architecture/PHASE-3.4-INVITE-SPEC.md)). Merged to `develop` (PR [#8](https://github.com/kevin-esq/sonivo/pull/8), `8db0714`).  
**Phase 3.5 thin RSVP:** **CLOSED** / **COMPLETED** (T-3.5.01–03) — Event yes/no/maybe + Attendance UI + Playwright ([`PHASE-3.5-RSVP-SPEC.md`](docs/03-architecture/PHASE-3.5-RSVP-SPEC.md)). Merged to `develop` (PR [#10](https://github.com/kevin-esq/sonivo/pull/10), `cbc8824`).  
**Phase 3.6 thin Event PATCH/cancel:** **CLOSED** / **COMPLETED** (T-3.6.01–03) — Owner metadata PATCH + cancel/soft-hide ([`PHASE-3.6-EVENT-SPEC.md`](docs/03-architecture/PHASE-3.6-EVENT-SPEC.md)).  
**Next:** requires **human decision / authorization**. File Resource (**T-3.2.06**) and SMTP remain **DEFERRED**. Do not merge to `main`.

Until the user explicitly authorizes additional work:

- Do **not** implement file Resource (T-3.2.06) / SMTP unless separately approved
- Do **not** expand Event PATCH/cancel beyond the closed thin 3.6 spec (no location/notes, no includeCancelled)
- Do **not** expand RSVP beyond the closed thin 3.5 spec without further approval
- Do **not** install skills or non-stack tooling without approval
- Do **not** push / create GitHub remotes / change branch protection unless explicitly authorized
- Foundation + Group/Membership + repertoire + Phase 3.3 scheduling + Phase 3.4 invite + Phase 3.5 RSVP + Phase 3.6 Event lifecycle maintenance within the accepted contracts is allowed
- Local PostgreSQL: repository `compose.yaml` (host port **5433**)

---

## Before doing anything

1. Read [`docs/00-context/CONTEXT.md`](docs/00-context/CONTEXT.md).
2. Read **ACCEPTED** entries in [`docs/03-architecture/DECISIONS.md`](docs/03-architecture/DECISIONS.md).
3. Do not reopen ACCEPTED ADRs 0001–0025 without a superseding ADR.
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

Branches: `main` (stable), `develop` (integration), `feature/*`, `fix/*`, `chore/*`, `docs/*`.  
Feature work branches from `develop` and merges via PR — not onto `main` directly.  
Conventional Commits; PRs use `.github/pull_request_template.md`; CI must be green before merge.  
Details: [`README.md`](README.md).

### Git authority (hard)

Agents **MUST NOT** commit, push, create PRs, merge PRs, or change GitHub configuration/settings/branch protection unless the **current task explicitly authorizes** that action.

Ticket completion does **not** authorize commit or push.

### Lifecycle

```text
IMPLEMENT → REPORT → HUMAN REVIEW → HUMAN APPROVAL → GIT CHECKPOINT → PUSH/PR → CI VERIFICATION
```

1. Agent completes the ticket and **reports** (include Git state — see below).  
2. Human **reviews**.  
3. Human **approves** the implementation (product/behavior acceptance).  
4. Repository enters **`Git checkpoint: PENDING`**.  
5. **Separate** explicit authorization is required for **commit**.  
6. **Separate** explicit authorization is required for **push** and/or **PR**, unless the human’s authorization text **explicitly combines** them with commit.

Do **not** infer commit/push/PR authorization from: “ticket complete”, “approved”, “looks good”, “continue”, or authorization of the **next** ticket — unless the user explicitly includes commit/push/PR in that message.

### Checkpoint policy

- **Normal ticket:** after human approval → `Git checkpoint: PENDING`; next operational step is normally a dedicated Git checkpoint authorization.  
- **Batching:** several tightly related, **human-approved** tickets may share one commit/PR when they form one coherent vertical slice — only if the human **explicitly** chooses to batch; `.scratch/NOW.md` must list which approved tickets are included; do not mix unrelated work.  
- **Phase transition:** a Git checkpoint is **mandatory** before treating a major implementation phase as operationally closed. Do not leave approved phase work silently uncommitted.

### Commit quality (when commit is authorized)

- Intended branch; approved scope only; Conventional Commits; concise meaningful message.  
- No secrets, `.env`, generated junk, or unrelated files.  
- Run relevant local build/tests before commit; never claim they passed if not run.

### Push / PR / CI (when authorized)

- Push ≠ commit unless combined in the authorization.  
- PR creation ≠ push unless combined; **merge is never implied** by PR creation.  
- After push, check GitHub CI; **do not ignore failing CI**.

### No automatic Git action

Agents must never “helpfully” commit or push merely because a ticket is complete.  
Agents must never leave the human unaware that **approved** implementation changes are still **uncommitted**.

Track state in [`.scratch/NOW.md`](.scratch/NOW.md):

```text
Implementation: COMPLETE | IN PROGRESS
Human approval: PENDING | APPROVED
Git checkpoint: PENDING | COMMITTED
Remote: NOT PUSHED | PUSHED
CI: NOT RUN | PASSING | FAILING
```

Every ticket **final report** must include: commit performed yes/no · push performed yes/no · uncommitted changes remaining yes/no.

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
- Phase 3.0.3 rehearsal Resources (0024): purpose `practice`; required Label; optional free-text Part; no Part entity; no Member→Part; no Event Resource snapshots
- Phase 3.1 Song/Arrangement fields (0025): OriginKind; duplicate titles ALLOWED; no IsDefault; Song soft-delete cascades live Arrs; Song DELETE expectedVersion + one tx + 409

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
- Respect Git checkpoint policy: never silent commit/push; always report commit/push/uncommitted status in ticket finals
- Keep `.scratch/NOW.md` checkpoint fields current after approvals and Git actions

---

## Tooling

Authoritative policy: [`docs/tooling/TOOLING-AUDIT.md`](docs/tooling/TOOLING-AUDIT.md) and **ADR-0002 (ACCEPTED)**.

- **AUTHORIZED project-local:** CORE + SPECIALIZED allowlist only (14 skill directories). Inventory: [`docs/tooling/SKILLS-INVENTORY.md`](docs/tooling/SKILLS-INVENTORY.md).
- **PRESENT ≠ AUTHORIZED.** User-global ambient tooling must **not** become a Sonivo dependency.
- Do not install further skills/tooling without explicit approval.
