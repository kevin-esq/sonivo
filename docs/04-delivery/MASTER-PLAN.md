# Multi-client architecture and delivery plan

**Status:** PROPOSED. **Owner:** Kevin. **Planning base:** `origin/develop` at `0357eb1a779a5e051e89a97ec6fe05cbc6e1b36c`. This plan authorizes no implementation.

## Vision

Keep Sonivo a modular monolith with one authoritative tenancy and authorization model, while making API contracts, deployments, operational controls, and client boundaries easier to verify. Reduce drift through narrow, reversible changes. Preserve the current Render release flow until the owner approves a new host or a `main` cutover.

## Principles

- One small PR per ticket; no big-bang folder moves or client rewrites.
- Verify source and tests before changing docs or contracts. A proposal is not a decision.
- Preserve Group-scoped authorization, host-only cookies, antiforgery, RLS request scope, SignalR checks, and separate Song / Arrangement / Arrangement Resource concepts.
- Additive contract changes first. Migrate consumers before removing aliases or old fields.
- Reuse ASP.NET Core OpenAPI, existing architecture tests, API clients, Docker image, and deployment controls before adding packages or wrappers.
- Do not add event sourcing, a message bus, a new read store, desktop code, or a new service in this plan.
- Keep localized UI and user content unchanged. All engineering documentation and agent instructions must be English.
- Treat backup, migration, and retry changes as data-safety work; prove failure and rollback paths before rollout.

## Phase map

| Phase | Outcome | Depends on | Parallelism |
|---|---|---|---|
| [1 — Hygiene and documentation](phases/PHASE-1-HYGIENE.md) | English, navigable, single-source docs and small repository guardrails | Owner approves taxonomy and canonical-doc decisions | Can start independently, in small batches |
| [2 — API contract and clients](phases/PHASE-2-CONTRACTS.md) | Versioned, reviewable API contract with drift controls and documented client compatibility | Host/API version policy proposal accepted; RLS and auth unchanged | Contract docs can parallel Phase 1; route migration waits for decision |
| [3 — Backend resilience](phases/PHASE-3-RESILIENCE.md) | Explicit health, retry, worker, delivery, and telemetry behavior | Host decision for platform-specific work; RLS transaction invariants | Analysis can parallel Phase 2; changes split by capability |
| [4 — Data and environments](phases/PHASE-4-DATA-ENVIRONMENTS.md) | Reproducible environment, pooler, migration, and recovery controls | Current manual migration procedure; provider access; owner retention/cost decisions | RLS test and docs can start; hosted previews depend on cost/security approval |
| [5 — Deployment and containers](phases/PHASE-5-DEPLOYMENT.md) | One approved API deployment path, tested image and rollback | **Host decision blocks production migration** | Image verification can parallel data docs; cutover cannot |
| [6 — Web surfaces](phases/PHASE-6-WEB.md) | Gradual route/host migration with cookie and slug boundaries intact | Host/domain and cookie proposals; each migration has parity tests | Independent after decisions, but avoid overlapping routes |
| [7 — Shared playback and realtime](phases/PHASE-7-SHARED-CORE.md) | Evidence-based reusable playback boundary and documented realtime contract | Desktop needs and second-consumer proof; accepted ADR for protocol expansion | Discovery can parallel other phases; extraction waits |
| [8 — Backend and E2E structure](phases/PHASE-8-STRUCTURE.md) | Better capability ownership and enforcement without new layers | Existing tests and architecture rules; no behavior migration | Folder-only moves can parallel contract work if disjoint |
| [9 — Mobile and desktop readiness](phases/PHASE-9-CLIENT-RELEASES.md) | Verified native client auth/version policy, desktop spike, area CI/release plan | Platform-owner decisions, host contract, measured user needs | Mobile audit can parallel; desktop decision depends on Phase 7 spike |

## Dependency order

```text
Phase 0 analysis (this PR)
  ├─ Phase 1 documentation foundation ─┬─ Phase 2 API contract
  │                                    ├─ Phase 4 data controls
  │                                    └─ Phase 8 structural guardrails
  ├─ Phase 3 resilience discovery ─────┐
  ├─ Phase 5 host decision ────────────┴─ deployment/cutover work
  ├─ Phase 6 host routing (after domain decision)
  └─ Phase 7 reuse/realtime discovery ─── Phase 9 desktop decision
```

The diagram is a proposal. Tickets list exact dependencies. No stage implies permission to start dependent work.

## Main risks and mitigations

| Risk | Mitigation |
|---|---|
| Stale docs become accidental authority | Link all proposals to source and accepted ADR; reconcile `CONTEXT.md` first. |
| Public route or generated-client change breaks mobile releases | Keep current routes; inventory all callers; additive rollout, contract tests, deprecation owner decision. |
| Retry duplicates writes or loses RLS transaction scope | Classify operations; retry whole transaction only; use PostgreSQL integration tests under constrained principal. |
| Worker lost on process recycle or multi-instance duplicate execution | Map durable state and idempotency first; define lease/ownership semantics before selecting host or queue. |
| Host/DNS/cookie migration locks users out | No DNS changes until host ADR; test handoff, CSRF, OAuth, passkeys, and rollback across exact origins. |
| More tooling increases maintenance or paid exposure | Prefer current tests/platform; check current license and maintenance before a package proposal; owner approves cost. |
| Translation changes meaning or agent behavior | Batch by folder; preserve links, quotes, UI copy, fixtures, and skill behavior; review sensitive legal/security text. |
| Broad structural refactor hides behavior changes | One capability or doc set per PR; no mass rename; snapshot routes/contracts before extraction. |

## Resolved owner decisions

- **API host (2026-11-27):** The owner reconfirmed accepted ADR-0069: Hetzner
  Cloud for the API, Vercel for the BFF, Neon production, and R2. Render remains
  the current live `develop` deployment; production release moves to `main`
  after product readiness. T-502 must verify the selected Hetzner plan, budget,
  operating owner, production database branch, and rollback procedure before
  cutover.

## Blocking pending decisions — owner Kevin

1. **API contract:** approve URL versioning/deprecation policy and whether `/api/v1` aliases or a new base path is acceptable. Existing `/api/...` consumers must keep working until an approved migration.
2. **Domains:** approve which hosts are current vs target, whether Vercel nameservers are acceptable for wildcard tenant domains, and whether host-only session handoff remains the sole cross-host design.
3. **OpenAPI clients:** decide artifact ownership and supported generator/runtime after compatibility review. No client generation or generated files are approved by this plan.
4. **Telemetry:** choose data minimization, retention, access, and vendor only if platform logs are insufficient; avoid adding personal data capture.
5. **Outbox:** define which emails/notifications require durable delivery and duplicate/ordering semantics. Existing best-effort email ADR remains binding until superseded.
6. **Data recovery:** define PITR/backup retention, restore rehearsal cadence, and preview-branch cost/lifetime.
7. **Documentation:** choose whether historical Spanish security/legal documents should be translated in place or retained with English archival summaries. Current policy says preserve meaning; legal review remains owner-controlled.
8. **Desktop:** define minimum user requirements (multi-monitor, MIDI, local audio device, offline content rights) before selecting PWA, Tauri, or Electron.
9. **CI/release:** approve platform-specific release ownership, iOS signing boundary, required checks, and tag/version policy.

## Proposal status

The six requested decision drafts are under [`adr-proposals/`](adr-proposals/). They are intentionally non-binding. `DECISIONS.md` remains canonical; only owner-approved decisions may be recorded there.

## First recommended ticket

Start with [T-101 — reconcile durable phase and documentation sources](tickets/T-101-doc-source-reconciliation.md). It resolves the current `CONTEXT.md` status contradiction and compares root/canonical docs before broader reorganization. It changes documentation only and blocks no code work.
