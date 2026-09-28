---
name: knowledge-architecture
description: Design and maintain Sonivo's project knowledge system in Obsidian without duplicating canonical documentation. Use when organizing project knowledge or deciding where information belongs.
---

# Knowledge Architecture

Use layered project memory. Keep each fact in one canonical location and use links for navigation.

## Layers

- `AGENTS.md`: stable operating rules and source precedence.
- `.agents/skills/`: reusable procedures loaded on demand.
- `docs/`: durable project, product, domain, architecture, decision, and testing knowledge.
- `.scratch/NOW.md`: current task and checkpoint state; not product truth.
- Source code and tests: executable source of truth for current behavior.

## Placement

Ask whether information remains useful after the current task:

- Durable product or domain facts belong in the matching file under `docs/01-product/`, `docs/02-domain/`, or `docs/00-context/`.
- Architecture decisions belong in `docs/03-architecture/DECISIONS.md`; follow the repository's ADR policy.
- Architecture, API, security, and testing contracts belong in their existing `docs/03-architecture/` files or approved phase specs.
- Reusable procedures belong in `.agents/skills/`.
- Current focus and Git checkpoint state belong in `.scratch/NOW.md`.
- Temporary investigation notes belong in `.scratch/notes/` and should not become durable by default.

Use `docs/00-context/INDEX.md` as the Obsidian entry point. Do not create a parallel `knowledge/` tree; Sonivo's existing `docs/` hierarchy is canonical.

## Avoid

- Duplicating facts across `AGENTS.md`, `docs/`, and skills.
- Keeping completed ticket histories in `NOW.md` when specs, ADRs, and PRs already record them.
- Storing secrets, full chat transcripts, or temporary debugging output as durable memory.
- Creating empty directories or notes solely to match a generic template.
- Putting specialized procedures into `AGENTS.md`.
