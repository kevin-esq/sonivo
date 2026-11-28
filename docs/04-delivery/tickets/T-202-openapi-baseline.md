# T-202 — Capture reproducible OpenAPI baseline

**Metadata:** phase 2; status **In review**; priority P1; size S; risk low; depends on None; blocks T-203; suggested owner Kevin.

## Context and why

Program.cs uses built-in OpenAPI; no committed artifact found. See [recommendation verification](../RECOMMENDATIONS-VERIFICATION.md) and [phase 2](../phases/PHASE-2-CONTRACTS.md).

## Exact scope

Export Development /openapi/v1.json; record auth/errors/exclusions; do not add generator.

**Implementation evidence:** The authenticated Development export is captured in `tests/Sonivo.Api.Tests/Snapshots/openapi-v1.json` and compared after sorting JSON object keys. Its OpenAPI version is `3.1.1` (the .NET 10 default is 3.1). The document lists 136 paths, including health, client-error, and signed admin routes; it excludes hubs, its own route, and API/SPA fallbacks. It has no OpenAPI security schemes or operation security and does not consistently declare Problem Details responses. `EndpointInventoryTests` remains the authorization/rate-limit metadata guard. No generator or package was added.

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

- [x] Authenticated Development export is normalized and compared to a reviewed OpenAPI `3.1.1` snapshot. Microsoft documents OpenAPI 3.1 as the .NET 10 default for the existing `Microsoft.AspNetCore.OpenApi` `10.0.12` reference; no version pin or package change was needed.
- [x] The inventory documents included health, client-error, and signed admin paths, and excludes hubs, the OpenAPI endpoint, and API/SPA fallbacks. The signed admin path is present in the Development document and remains guarded by its existing signed internal API middleware.
- [x] No secret, personal data, localized UI copy, or unrelated file changes; no dependency added.
- [ ] One small PR using the repository template.

## Validation

- Focused OpenAPI baseline and endpoint inventory tests passed: 2/2.
- Full API test suite passed: 350/350.
- Release solution build passed: 10 projects, 0 errors, 7 existing warnings.
- `git diff --check` passes after the final documentation edit.
- No full solution test run. No package or tooling installed.

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

