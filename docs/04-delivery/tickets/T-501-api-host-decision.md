# T-501 — Resolve API host and release topology

**Metadata:** phase 5; status **In review — owner confirmed Hetzner target**; priority P0; size S; risk medium; depends on T-101; blocks T-301, T-304, T-402, T-403, T-502; suggested owner Kevin.

## Context and why

Render is the current live `develop` deployment with Neon `staging`; final production release on `main` follows product readiness. On 2026-11-27, the owner reconfirmed Hetzner as the future API host, retaining accepted ADR-0069 without amendment. See [recommendation verification](../RECOMMENDATIONS-VERIFICATION.md), [phase 5](../phases/PHASE-5-DEPLOYMENT.md), and [the deployment proposal](../adr-proposals/ADR-PROPOSAL-02-API-HOST.md).

## Exact scope

Document the current Render operation and Hetzner target, record the owner's confirmation of ADR-0069, and identify the remaining pre-cutover validation. No config changes.

**Findings:** The repository already contains a Linux .NET 10 API/static-export Docker image and a separate Hetzner/Caddy deployment compose file. Root development `compose.yaml` starts PostgreSQL only. Render currently serves the live `develop` branch with Neon `staging`; its `ASPNETCORE_ENVIRONMENT=Production` value does not establish that the final production launch has occurred. The owner confirmed Hetzner as the future API host, retaining accepted ADR-0069. T-502 must validate exact server size, budget, WebSocket/SignalR behavior, worker lifecycle, networking, migration order, and rollback before cutover. No source, configuration, provider, DNS, or database was changed.

## Out of scope

No unrelated behavior, broad rename, new project, secret/provider mutation, or package addition without owner approval. Do not exceed listed paths.

## Files/paths likely touched

DEPLOYMENT.md; docs/04-delivery/BOARD.md; MASTER-PLAN.md; PHASE-5-DEPLOYMENT.md; T-501; ADR proposal; .scratch/NOW.md

## Implementation plan

1. Confirm source and dependencies on approved branch.
2. Make smallest change satisfying acceptance criteria.
3. Update canonical docs, BOARD.md, and .scratch/NOW.md only when status changes.
4. Report contract, security, or scope questions before proceeding.

## Acceptance criteria

- [x] Kevin reconfirms the accepted Hetzner target; ADR-0069 remains unchanged.
- [x] Document Render `develop` as current and keep production cutover on `main` behind product readiness.
- [x] Record T-502 as the remaining plan-specific verification before cutover.
- [x] No secret, personal data, localized UI copy, or unrelated file changes.
- [ ] One small PR using the repository template.

## Validation

- `git diff --check` passes for the documentation changes.
- Cross-check deployment direction against accepted ADR-0069 and the Render configuration.
- No build or test applies; no product code or runtime configuration changed.


Review topology consistency; no cloud mutation.

## Rollback plan

Revert the documentation-only status update. No accepted ADR or deployment config changed.

## Risks and warning signs

Stop on ADR/phase conflict, public contract/security change, missing evidence, or provider cost. Do not provision a host or change deployment settings in T-501.

## Suggested branch and commits

- Branch: docs/api-host-decision
- Commit: docs(deploy): resolve API host topology

## Definition of Done

Acceptance passes; applicable checks green; docs English; BOARD.md and .scratch/NOW.md reflect actual state; PR uses .github/pull_request_template.md; owner review and Git authorization are explicit.

## Execution prompt

> Work only on T-501 in Sonivo. Read AGENTS.md, docs/00-context/CONTEXT.md, accepted decisions in docs/03-architecture/DECISIONS.md, and this ticket. Verify paths/status before editing. Implement only this scope. Preserve routes, Group authorization, host-only cookies, antiforgery, RLS, and SignalR unless an accepted decision changes them. Write engineering docs, comments, logs, tests, branch names, and commits in English; never translate locale files, fixtures, or user content. Add/update behavior tests. Run listed checks and report exact results. Update docs/04-delivery/BOARD.md and .scratch/NOW.md when ticket state changes. Do not install packages or change providers without explicit owner approval. Do not commit, push, open PR, or merge unless current authorization explicitly permits it.

