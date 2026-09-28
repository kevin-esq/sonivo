---
name: context-optimization
description: Keep Sonivo agent context high-signal by minimizing always-loaded rules, retrieving relevant docs just in time, and removing stale task state.
---

# Context Optimization

Optimize for useful signal, not maximum prompt size.

## Principles

- Keep `AGENTS.md` limited to stable rules, hard constraints, and navigation.
- Keep specialized workflows in on-demand `.agents/skills/` files.
- Keep durable project facts in their canonical `docs/` files.
- Keep `.scratch/NOW.md` concise and operational; historical detail belongs in ADRs, specs, or PR records.
- Retrieve only the files and sections relevant to the current task.
- Prefer links to duplicated summaries.

## Retrieval pattern

1. Index and filenames.
2. Relevant canonical note and section.
3. Supporting ADR/spec only as needed.
4. Code and tests for current behavior.

Before adding context, ask whether it changes the current decision, already exists elsewhere, or is temporary. Do not load or preserve information merely because it is available.
