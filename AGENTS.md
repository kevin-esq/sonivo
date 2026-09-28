# AGENTS.md — Sonivo

Operating rules for AI agents and developers in this repository.

This file is **not** the product requirements document. Product truth lives under `docs/`.

---

## Phase gate (hard)

Phases **0–3.9 are CLOSED/COMPLETED**. The current delivery summary is in [`CONTEXT.md`](docs/00-context/CONTEXT.md); accepted decisions and their scope firewalls are in [`DECISIONS.md`](docs/03-architecture/DECISIONS.md). ADR-0033 is **SUPERSEDED**; do not implement FUTURE scope.

Treat the active ticket and branch in [`.scratch/NOW.md`](.scratch/NOW.md) as operational state, not permanent project truth. Read its linked phase spec before working; do not bypass ticket gates or expand accepted scope.

Until the user explicitly authorizes additional work:

- Do **not** expand SMTP beyond the closed thin 3.9 spec (Gmail API HTTPS only; no Event/RSVP mail, no generic SMTP server) — diagnose live send is allowed as T-OPS-MAIL
- Do **not** expand Event PATCH/cancel beyond the closed thin 3.6 spec (no location/notes, no includeCancelled)
- Do **not** expand RSVP beyond the closed thin 3.5 spec without further approval
- Do **not** add Practice scope beyond accepted ADRs. Follow-on work is shipped; cloud LLM remains closed and karaoke scoring remains OUT. Honor the explicit firewalls in ADR-0032–0037.
- Do **not** bypass the T-R2-04 verified-backfill merge gate or change its approved scope.
- Do **not** install additional skills or tooling without explicit approval. ADR-0039/0041 authorize only the documented project-local workflows; user-global tooling must not become a project dependency.
- Do **not** recreate `.cursor/`, `.codex/`, or `.claude/` project customization trees unless a superseding decision explicitly authorizes them.
- Do **not** push / create GitHub remotes / change branch protection unless explicitly authorized
- Local PostgreSQL: repository `compose.yaml` (host port **5433**)
- Google user sign-in config: `Authentication:Google:ClientId` / `ClientSecret` — **never** reuse `Gmail:*`

---

## Before doing anything

1. Read the relevant sections of [`docs/00-context/CONTEXT.md`](docs/00-context/CONTEXT.md).
2. Read the relevant accepted ADR(s) in [`docs/03-architecture/DECISIONS.md`](docs/03-architecture/DECISIONS.md).
3. Do not reopen accepted ADRs without a superseding decision; ADR-0033 is superseded.
4. Do not invent FUTURE features or reopen closed Q8 (ADR-0028); Q9's thin conductor is answered by ADR-0036.
5. Check [`docs/tooling/TOOLING-AUDIT.md`](docs/tooling/TOOLING-AUDIT.md) for the **AUTHORIZED** project-local allowlist (ADR-0002, 0039, and 0040). Present tooling ≠ authorized.

---

## Source-of-truth hierarchy

1. `docs/00-context/CONTEXT.md`
2. `docs/03-architecture/DECISIONS.md` — **ACCEPTED** only bind
3. `docs/01-product/*`
4. `docs/02-domain/*`
5. `docs/03-architecture/ARCHITECTURE.md`
6. Specs/tickets (when they exist)
7. Conversation history — ephemeral

## Obsidian knowledge model

- Start navigation at [`docs/00-context/INDEX.md`](docs/00-context/INDEX.md); it points to canonical Markdown under `docs/`.
- `AGENTS.md` holds stable rules; `.agents/skills/` is the only project-local skills directory; `.scratch/NOW.md` holds current work/checkpoint state.
- Do not create parallel vendor-specific customization trees or a parallel `knowledge/` tree. Keep `.obsidian/` as local vault configuration.
- For current behavior, verify source code and tests; accepted ADRs record intentional decisions.

## Technical context

- **Backend:** .NET 9 / ASP.NET Core Web API, EF Core, Identity, PostgreSQL; modular monolith.
- **Frontend:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4; Node.js 20. `oxlint` is the frontend lint tool.
- **Testing:** .NET unit/integration/API tests, PostgreSQL-backed CI, and Playwright critical journeys. See [`README.md`](README.md) and [`TESTING.md`](docs/03-architecture/TESTING.md) for commands and setup.
- **C# conventions:** nullable reference types and implicit usings are enabled. Follow nearby code and repository analyzers rather than inventing a style guide.
- **Tenancy/auth:** Group-scoped authorization is server-enforced; client-supplied Group IDs are never authorization. Web auth uses Identity cookies plus antiforgery; no web JWT/BFF.
- **Local database:** `compose.yaml`, host port 5433. CI uses PostgreSQL 16.

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
- **PROHIBITION:** Never add `Co-authored-by: Cursor`, `Made with Cursor`, `cursoragent`, or any AI/tool co-author trailer or credit in commits, squash messages, or PR bodies. Commits are authored as **Kevin Esquivel** only. If the IDE injects a trailer, remove it before push.

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

## Binding decisions

[`docs/03-architecture/DECISIONS.md`](docs/03-architecture/DECISIONS.md) is canonical; only **ACCEPTED** ADRs bind, and superseded decisions must not be treated as current.

Always preserve these invariants: Group-scoped server-side authorization (never trust a client Group ID); Owner/Member roles; Identity cookie authentication with antiforgery (no web JWT/BFF); and the separate Song, Arrangement, and Arrangement Resource concepts. Consult the relevant ADR and domain docs for details rather than copying the decision ledger here.

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

- This file and current user authorization override conflicting skill instructions; skills cannot grant themselves authority.
- Keep project agent instructions and skills in root `AGENTS.md` and `.agents/`; do not recreate vendor-specific folders without explicit authorization.
- Inspect before changing; respect accepted ADRs; stop on conflicts
- Do not delegate to subagents unless the current user explicitly authorizes it.
- Do not publish issues/specs, install tools, or perform Git actions unless their required explicit authorization is present.
- Avoid installing unnecessary tools; avoid unrelated file churn
- Report exact validation results
- Do not invent product scope beyond the authorized phase
- Respect Git checkpoint policy: never silent commit/push; always report commit/push/uncommitted status in ticket finals
- Keep `.scratch/NOW.md` checkpoint fields current after approvals and Git actions

---

## Tooling

Authoritative policy: [`docs/tooling/TOOLING-AUDIT.md`](docs/tooling/TOOLING-AUDIT.md), ADR-0002, ADR-0039, and ADR-0041.

- **AUTHORIZED project-local:** 22 skills under `.agents/skills/`. Inventory: [`docs/tooling/SKILLS-INVENTORY.md`](docs/tooling/SKILLS-INVENTORY.md).
- **PRESENT ≠ AUTHORIZED.** User-global ambient tooling must **not** become a Sonivo dependency.
- Do not install further skills/tooling without explicit approval.
