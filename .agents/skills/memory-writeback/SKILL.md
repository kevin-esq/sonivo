---
name: memory-writeback
description: Record durable discoveries in Sonivo's existing canonical documentation. Use after learning a reusable constraint, decision, domain invariant, implementation pattern, or operational lesson.
---

# Memory Writeback

Write back only information that will help future work beyond the current task.

## Store

- Accepted product, domain, security, and architecture decisions.
- Reusable implementation or testing patterns not already obvious from code.
- Operational procedures, recurring pitfalls, and external limitations.
- Current task and Git checkpoint state in `.scratch/NOW.md` while work is active.

## Workflow

1. Search existing `docs/` and `.scratch/` for the canonical home.
2. Update the existing source instead of creating parallel notes.
3. For a material decision, follow Sonivo's ADR workflow in `docs/03-architecture/DECISIONS.md`; get required approval before changing accepted scope.
4. Update `CONTEXT.md` and `docs/00-context/INDEX.md` only when their summaries or navigation need to change.
5. Keep the update concise, factual, linked, and clearly labeled where required.
6. Remove or correct stale claims when verified; never silently rewrite history.

## Do not store

- Trivial edits, routine successful test runs, temporary debugging output, full conversations, secrets, or facts already represented accurately by code and tests.
- A second `knowledge/` copy of information already owned by `docs/`.
