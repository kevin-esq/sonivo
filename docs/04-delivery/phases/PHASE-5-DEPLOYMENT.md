# Phase 5 — Deployment and containers

**Status:** PROPOSED. **Goal:** keep one documented and tested deployment path for API, web, realtime, and workers.

**Scope:** resolve current Render vs future SmarterASP vs accepted ADR-0069 target; verify exact host plan; test existing image; complete local service composition only where it improves onboarding; define worker, migration, health, and rollback operations.

**Out of scope:** changing live Render configuration or DNS; creating a second image; migrating production; assuming SmarterASP plan capabilities; adding a service per worker without load/reliability evidence.

**Exit criteria:** owner accepts host ADR; selected plan passes .NET 10, WebSockets, port, health, secrets, storage, network, and process-lifetime tests; rollout and rollback are rehearsed; existing Docker path is reused or a measured gap is documented.

**Tickets:** T-501 to T-503. T-501 blocks all host cutover work.
