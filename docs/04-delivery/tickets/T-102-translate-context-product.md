# T-102 — Translate context/product documentation

**Metadata:** phase 1; status **In review**; priority P2; size M; risk medium; depends on T-101; blocks T-106; suggested owner Kevin.

## Context and why

Language audit found Spanish design brief and context prose. See [recommendation verification](../RECOMMENDATIONS-VERIFICATION.md) and [phase 1](../phases/PHASE-1-HYGIENE.md).

## Exact scope

Inventory verified prose, then translate in bounded batches. Preserve links, terms, status, locale examples.

**Verified inventory:** `docs/00-context/CONTEXT.md`, `GLOSSARY.md`, `INDEX.md`, and `docs/01-product/PRODUCT.md` use English prose. Their Spanish words are approved product names, UI labels, or domain examples and remain unchanged. `docs/01-product/GATE-B-DESIGN-BRIEF.md` contains Spanish engineering/design prose and is the only file translated in this ticket.

## Out of scope

No unrelated behavior, broad rename, new project, secret/provider mutation, or package addition without owner approval. Do not exceed listed paths.

## Files/paths likely touched

docs/00-context/; docs/01-product/GATE-B-DESIGN-BRIEF.md; PROJECT-STRUCTURE.md only if tracked

## Implementation plan

1. Confirm source and dependencies on approved branch.
2. Make smallest change satisfying acceptance criteria.
3. Update canonical docs, BOARD.md, and .scratch/NOW.md only when status changes.
4. Report contract, security, or scope questions before proceeding.

## Acceptance criteria

- [x] Verified English prose in context/product sources; translated the Gate B brief with all 14 headings retained, relative links preserved, and Spanish UI labels untouched.
- [x] No secret, personal data, locale files, fixtures, or unrelated files changed.
- [ ] One small PR using the repository template.

## Validation

- The source and translation retain 14 Markdown headings in the same order; heading text is translated.
- Relative links resolve; `git diff --check` passes.
- Documentation-only change; no build or tests run.

## Rollback plan

Revert batch.

## Risks and warning signs

Stop on ADR/phase conflict, public contract/security change, missing evidence, or dependency/provider cost. Record conflict; do not infer approval.

## Suggested branch and commits

- Branch: docs/translate-context-product
- Commit: docs(context): translate context and product documents

## Definition of Done

Acceptance passes; applicable checks green; docs English; BOARD.md and .scratch/NOW.md reflect actual state; PR uses .github/pull_request_template.md; owner review and Git authorization are explicit.

## Execution prompt

> Work only on T-102 in Sonivo. Read AGENTS.md, docs/00-context/CONTEXT.md, accepted decisions in docs/03-architecture/DECISIONS.md, and this ticket. Verify paths/status before editing. Implement only this scope. Preserve routes, Group authorization, host-only cookies, antiforgery, RLS, and SignalR unless an accepted decision changes them. Write engineering docs, comments, logs, tests, branch names, and commits in English; never translate locale files, fixtures, or user content. Add/update behavior tests. Run listed checks and report exact results. Update docs/04-delivery/BOARD.md and .scratch/NOW.md when ticket state changes. Do not install packages or change providers without explicit owner approval. Do not commit, push, open PR, or merge unless current authorization explicitly permits it.

