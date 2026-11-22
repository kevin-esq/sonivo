# API host and release topology

**Status:** PROPOSED — not accepted. Current operations doc says Render hosts production from develop using Docker and Neon staging; SmarterASP is future. Accepted ADR-0069 records another target topology. The repo image is already multi-stage and non-root.

## Context

Kevin must reconcile current Render release flow, future SmarterASP direction, and accepted ADR-0069. Identify exact plan, budget, operating owner, target timing, production database branch, and rollback authority.

## Owner decision required

Keep Render as current host until product readiness; preserve Docker image as portable artifact. Before any migration, rehearse .NET 10 hosting, WebSockets, health, workers, storage, secrets, database networking, migrations, and rollback on an isolated environment.

## Proposed direction

Alternatives: SmarterASP Windows/IIS host or Linux VPS; accepted Vercel + Hetzner + Neon + R2 topology; other container host only after cost/ops comparison. No alternative is selected here.

## Alternatives

Provider plan support differs. SmarterASP documents Docker on Linux VPS and ASP.NET Core on Windows plans; exact plan features and worker/WebSocket limits need vendor verification. Migration risks OAuth origins, hub transport, worker lifecycle, file storage, cold starts and release ordering.

## Consequences and scope limits

No new runtime dependency. Host changes may add paid infrastructure; requires explicit cost approval and superseding accepted ADR.

## Dependencies and licensing

https://www.smarterasp.net/vps_linux/; https://www.smarterasp.net/managed-hosting; https://learn.microsoft.com/en-us/aspnet/core/signalr/supported-platforms?view=aspnetcore-10.0; ../RECOMMENDATIONS-VERIFICATION.md#r2--docker-and-api-host

## References

undefined


