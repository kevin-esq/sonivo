---
name: project-documentation
description: Create and update concise Sonivo engineering documentation aligned with code, accepted decisions, and repository conventions. Use for README, context, domain, architecture, testing, and navigation docs.
---

# Project Documentation

Document stable concepts, decisions, constraints, and procedures without duplicating source code or creating competing sources of truth.

## Canonical locations

- `README.md`: onboarding and repository-level usage.
- `docs/00-context/`: durable project context, glossary, and Obsidian index.
- `docs/01-product/`: product requirements and personas.
- `docs/02-domain/`: domain concepts and model.
- `docs/03-architecture/`: architecture, API, security, persistence, testing, ADRs, and approved phase specs.
- `.agents/skills/`: reusable agent procedures.
- `.scratch/NOW.md`: temporary active work and checkpoint state.

## Rules

- Explain why, constraints, contracts, and stable behavior; avoid code inventories.
- Follow repository terminology, labels, ADR status, and source precedence.
- Separate confirmed behavior from assumptions, future scope, and history.
- Verify commands, paths, and links before documenting them.
- Update the canonical note first, then its index or summary if needed.
- Obsidian should navigate the existing Markdown docs; do not maintain a duplicate vault tree.
