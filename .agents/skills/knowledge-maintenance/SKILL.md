---
name: knowledge-maintenance
description: Audit Sonivo's documentation and Obsidian navigation for stale, contradictory, duplicated, broken, orphaned, or misplaced information. Use during documentation cleanup or when instructions disagree.
---

# Knowledge Maintenance

Keep project knowledge small, current, navigable, and trustworthy.

## Audit checklist

- Stale phase, ticket, branch, or tooling status.
- Contradictions between `AGENTS.md`, `CONTEXT.md`, accepted ADRs, specs, and `.scratch/NOW.md`.
- Duplicate facts or a procedure stored as project truth.
- Broken relative Markdown links and missing index entries.
- Completed work left in current-state notes.
- Empty template directories or project facts copied into skill files.
- Claims that should instead be verified from source code or tests.

## Workflow

1. Read the index and the relevant canonical notes.
2. Verify consequential claims against current code, tests, accepted decisions, or Git state as appropriate.
3. Fix the owning source first; update summaries and navigation afterward.
4. Preserve historical decisions and mark superseded status explicitly.
5. Keep `.scratch/NOW.md` focused on current work and checkpoint fields.
6. Do not rewrite unrelated documentation for stylistic consistency or create empty files to fill a template tree.
