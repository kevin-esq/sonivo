# Phase 3 — Backend resilience

**Status:** PROPOSED. **Goal:** make health, external-call failures, workers, delivery, and operational signals explicit.

**Scope:** define liveness/readiness; classify HTTP and database operations before adding retries; inspect hosted-service durability and idempotency; assess email/notification outbox needs; define logs/metrics/traces and alerting needs.

**Out of scope:** blanket retry policies; automatic webhook replay changes; new message bus; paid observability vendor; changing email's accepted best-effort behavior without an ADR.

**Exit criteria:** every retry has an idempotency and transaction rationale; RLS transaction scope remains atomic; worker loss/duplicate behavior is tested; health probes have stable semantics; telemetry data/retention/access is approved.

**Tickets:** T-301 to T-305. Host-specific worker behavior waits for T-501; resilience implementation waits for per-integration approval.
