---
name: knowledge-retrieval
description: Retrieve the minimum relevant Sonivo context before changing code or docs. Use when work depends on project rules, domain constraints, decisions, or prior work.
---

# Knowledge Retrieval

Retrieve context progressively; do not load the whole repository or vault by default.

## Workflow

1. Identify the affected subsystem or decision.
2. Read `AGENTS.md` and the relevant parts of `docs/00-context/CONTEXT.md`.
3. Use `docs/00-context/INDEX.md` to locate canonical notes when needed.
4. Read relevant accepted ADRs and domain, architecture, security, or testing docs.
5. Check `.scratch/NOW.md` only when current task state or Git checkpoint affects the work.
6. Inspect the controlling code and neighboring tests.
7. Resolve contradictions before editing; report unresolved conflicts rather than guessing.

## Source discipline

- Code and tests describe current executable behavior.
- Accepted ADRs bind intentional decisions; do not reopen them without explicit authorization and a superseding decision.
- `AGENTS.md` provides stable operating constraints; `CONTEXT.md` summarizes durable project truth.
- Phase specs and tickets define only their approved scope.
- `.scratch/NOW.md` is temporary operational state, never product or architecture truth.

Read only the sections that affect the current decision. Carry forward concise facts, not retrieved text dumps.
