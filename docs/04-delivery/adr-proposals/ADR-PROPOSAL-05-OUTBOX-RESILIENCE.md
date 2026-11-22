# Outbox and integration resilience strategy

**Status:** PROPOSED — not accepted. Billing/webhook persistence exists; email is best-effort under ADR-0068; general notification/email outbox, telemetry vendor and HttpClient resilience were not verified. Hosted workers run in API process.

## Context

Kevin must choose which notifications need durable delivery, required ordering/duplicate semantics, telemetry data and retention, and acceptable operating cost. Existing best-effort email and billing/webhook rules remain binding.

## Owner decision required

Start with per-integration failure classification and tests. Add durable outbox only for events with an approved delivery guarantee. Add one bounded resilience policy per idempotent HTTP client. Keep logs as baseline until gaps justify telemetry vendor.

## Proposed direction

Keep current best-effort delivery and platform logs. A database outbox is appropriate for required durable delivery; external queue is not justified until scale/availability proves it.

## Alternatives

Retries can duplicate charges/emails or escape the RLS transaction. Outbox introduces schema, worker, retention and replay controls. Telemetry introduces sensitive data and vendor retention concerns.

## Consequences and scope limits

Microsoft.Extensions.Http.Resilience is a Microsoft package; verify current package license/version before adding. No package or paid service is adopted by this proposal.

## Dependencies and licensing

https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience; https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency; ../RECOMMENDATIONS-VERIFICATION.md#r3--fault-tolerance

## References

undefined


