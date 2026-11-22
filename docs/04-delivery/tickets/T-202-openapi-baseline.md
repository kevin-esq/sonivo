# T-202 — Capture reproducible OpenAPI baseline

**Metadata:** phase 2; status **Backlog**; priority P1; size S; risk low; depends on None; blocks T-203; suggested owner Kevin.

## Context and why

Program.cs uses built-in OpenAPI; no committed artifact found. See [recommendation verification](../RECOMMENDATIONS-VERIFICATION.md) and [phase 2](../phases/PHASE-2-CONTRACTS.md).

## Exact scope

Export Development /openapi/v1.json; record auth/errors/exclusions; do not add generator.

## Out of scope

No unrelated behavior, broad rename, new project, secret/provider mutation, or package addition without owner approval. Do not exceed listed paths.

## Files/paths likely touched

Program.cs/csproj; API tests; API.md

## Implementation plan

1. Confirm source and dependencies on approved branch.
2. Make smallest change satisfying acceptance criteria.
3. Update canonical docs, BOARD.md, and .scratch/NOW.md only when status changes.
4. Report contract, security, or scope questions before proceeding.

## Acceptance criteria

- [ ] Deterministic output with explicitly recorded OpenAPI format/version; no unintended internal routes. Confirm whether package 10.0.12 defaults to 3.2 or 3.1 before pinning a contract format.
- [ ] No secret, personal data, localized UI copy, or unrelated file changes.
- [ ] One small PR using the repository template.

## Tests to add or update
**Commands and expected results:** use the relevant commands in [README.md](../README.md#validation-command-reference). Commands exit 0, focused regression tests pass, and required external infrastructure is available. Report unmet prerequisites; never claim an unrun check.


Compare normalized exports; assert routes/security metadata.

## Rollback plan

Remove unstable artifact/test.

## Risks and warning signs

Stop on ADR/phase conflict, public contract/security change, missing evidence, or dependency/provider cost. Record conflict; do not infer approval.

## Suggested branch and commits

- Branch: feature/openapi-baseline
- Commit: test(api): capture reproducible OpenAPI baseline

## Definition of Done

Acceptance passes; applicable checks green; docs English; BOARD.md and .scratch/NOW.md reflect actual state; PR uses .github/pull_request_template.md; owner review and Git authorization are explicit.

## Execution prompt

> Work only on T-202 in Sonivo. Read AGENTS.md, docs/00-context/CONTEXT.md, accepted decisions in docs/03-architecture/DECISIONS.md, and this ticket. Verify paths/status before editing. Implement only this scope. Preserve routes, Group authorization, host-only cookies, antiforgery, RLS, and SignalR unless an accepted decision changes them. Write engineering docs, comments, logs, tests, branch names, and commits in English; never translate locale files, fixtures, or user content. Add/update behavior tests. Run listed checks and report exact results. Update docs/04-delivery/BOARD.md and .scratch/NOW.md when ticket state changes. Do not install packages or change providers without explicit owner approval. Do not commit, push, open PR, or merge unless current authorization explicitly permits it.

