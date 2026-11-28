# Delivery board

**Status:** ticket status is shown per row; none grants implementation authorization. Dependencies are blocking edges. “Risk” and “size” are initial estimates and need confirmation during ticket review.

**T-101 overlap:** merged PR [#379](https://github.com/kevin-esq/sonivo/pull/379), merge commit `0357eb1`, already reconciled Phase 4 status across `CONTEXT.md`, `DEPLOYMENT.md`, and the RLS phase specification. T-101 records that work and covers document ownership only; no Phase 4 edits are repeated here.

| ID | Phase | Title | Status | Depends on | Risk / size |
|---|---:|---|---|---|---|
| [T-101](tickets/T-101-doc-source-reconciliation.md) | 1 | Reconcile phase status and document ownership | Merged (#382) | — | P0 · S · Low |
| [T-102](tickets/T-102-translate-context-product.md) | 1 | Translate context/product documentation | Backlog | T-101 | P2 · M · Medium |
| [T-103](tickets/T-103-translate-domain-architecture.md) | 1 | Translate domain/architecture documentation | Backlog | T-101 | P2 · L · High |
| [T-104](tickets/T-104-translate-design-tooling.md) | 1 | Translate design/tooling guidance | Backlog | T-101 | P2 · M · Medium |
| [T-105](tickets/T-105-translate-historical-notes.md) | 1 | Translate or archive historical Spanish notes | Backlog | T-101 | P3 · L · High |
| [T-106](tickets/T-106-english-doc-check.md) | 1 | Add English-prose regression check | Backlog | T-102–T-104 | P2 · S · Medium |
| [T-107](tickets/T-107-documentation-taxonomy.md) | 1 | Define documentation taxonomy and contributor entry points | Backlog | T-101 | P2 · M · Medium |
| [T-108](tickets/T-108-ignore-scratch-shots.md) | 1 | Ignore and untrack versioned scratch screenshots | Backlog | T-101 | P2 · S · Medium |
| [T-201](tickets/T-201-api-version-policy.md) | 2 | Approve API version and deprecation policy | Backlog | T-202 | P0 · S · High |
| [T-202](tickets/T-202-openapi-baseline.md) | 2 | Capture reproducible OpenAPI baseline | Backlog | — | P1 · S · Low |
| [T-203](tickets/T-203-openapi-drift-gate.md) | 2 | Add OpenAPI drift gate and client-generation decision | Backlog | T-201, T-202 | P1 · M · High |
| [T-204](tickets/T-204-mobile-version-contract.md) | 2 | Document native minimum-version and auth contract | Backlog | T-202 | P2 · S · Medium |
| [T-301](tickets/T-301-health-semantics.md) | 3 | Define liveness/readiness semantics | Backlog | T-501 | P1 · S · Medium |
| [T-302](tickets/T-302-http-resilience.md) | 3 | Apply bounded resilience to approved integrations | Backlog | T-501 | P1 · M · High |
| [T-303](tickets/T-303-database-retry-rls.md) | 3 | Prove safe database retry boundaries under RLS | Merged (#387) | T-401 | P1 · M · High |
| [T-304](tickets/T-304-worker-lifecycle.md) | 3 | Map worker durability and recycle behavior | Backlog | T-501 | P1 · M · High |
| [T-305](tickets/T-305-delivery-observability.md) | 3 | Decide durable notifications and operational telemetry | Backlog | — | P2 · M · High |
| [T-401](tickets/T-401-rls-pooler-tests.md) | 4 | Add transaction-pooler RLS regression coverage | Merged (#383) | — | P0 · M · High |
| [T-402](tickets/T-402-migration-release-gate.md) | 4 | Add privileged migration release gate | Backlog | T-501 | P1 · M · High |
| [T-403](tickets/T-403-environment-secret-map.md) | 4 | Document environment and secret ownership | Backlog | T-501 | P2 · S · Medium |
| [T-404](tickets/T-404-neon-recovery-policy.md) | 4 | Set Neon branch, backup, and restore policy | Backlog | T-501 | P1 · M · High |
| [T-501](tickets/T-501-api-host-decision.md) | 5 | Resolve API host and release topology | Backlog | T-101 | P0 · S · High |
| [T-502](tickets/T-502-host-capability-test.md) | 5 | Verify selected host before cutover | Backlog | T-501 | P1 · M · High |
| [T-503](tickets/T-503-local-compose.md) | 5 | Complete local Compose only for proven gaps | Backlog | T-101 | P2 · M · Medium |
| [T-601](tickets/T-601-legacy-route-inventory.md) | 6 | Map legacy and App Router route ownership | Backlog | T-101 | P1 · S · Low |
| [T-602](tickets/T-602-legacy-route-slice.md) | 6 | Migrate one legacy route slice | Backlog | T-601 | P2 · M · High |
| [T-603](tickets/T-603-host-security-gates.md) | 6 | Verify cross-host routing and session security | Backlog | T-501 | P1 · M · High |
| [T-701](tickets/T-701-player-reuse-spike.md) | 7 | Measure whether playback needs shared package | Backlog | — | P3 · S · Low |
| [T-702](tickets/T-702-realtime-contract.md) | 7 | Specify SignalR events and compatibility | Backlog | T-501 | P2 · M · High |
| [T-801](tickets/T-801-purge-ownership.md) | 8 | Move Group purge ownership out of Payments | Backlog | T-101 | P2 · S · Medium |
| [T-802](tickets/T-802-dotnet-pinning.md) | 8 | Evaluate SDK/package version centralization | Backlog | T-101 | P2 · S · Medium |
| [T-803](tickets/T-803-e2e-names.md) | 8 | Rename E2E specs in one feature batch | Backlog | T-101 | P3 · S · Medium |
| [T-804](tickets/T-804-architecture-rules.md) | 8 | Extend architecture tests for proven gaps | Backlog | T-101 | P2 · S · Medium |
| [T-901](tickets/T-901-native-release-audit.md) | 9 | Verify native auth/storage/version rollout | Backlog | T-204 | P1 · M · High |
| [T-902](tickets/T-902-desktop-spike.md) | 9 | Run no-code desktop feasibility spike | Backlog | T-701 | P3 · M · Medium |
| [T-903](tickets/T-903-area-ci-releases.md) | 9 | Define mobile and area CI/release policy | Backlog | T-901 | P2 · M · High |

