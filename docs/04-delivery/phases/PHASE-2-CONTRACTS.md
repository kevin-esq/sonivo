# Phase 2 — API contract and clients

**Status:** PROPOSED. **Goal:** make API contracts reviewable across web, Android, and iOS while keeping current behavior compatible.

**Scope:** decide public version/deprecation policy; capture the existing .NET OpenAPI output; define drift checking and generation compatibility; document mobile version gate and realtime exclusions; migrate clients only after contract approval.

**Out of scope:** route changes before approval; mass client regeneration; versioning SignalR without a separate accepted protocol decision; changes to auth, CSRF, tenant authorization, or RLS.

**Exit criteria:** accepted versioning decision; checked-in or reproducibly generated OpenAPI artifact matches live output; CI drift check is deterministic; client update plan covers web/Kotlin/Swift and errors; compatibility tests pass.

**Tickets:** T-201 to T-204. T-201 blocks route migration; T-202 captures baseline; T-203 requires artifact ownership; T-204 can document current middleware independently.
