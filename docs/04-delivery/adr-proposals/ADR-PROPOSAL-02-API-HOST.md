# API host and release topology

**Status:** PROPOSAL — operational sequencing only; not an ADR amendment.
**Updated:** 2026-11-27. The owner reconfirmed accepted ADR-0069's Hetzner
target. No superseding host decision is proposed.

## Context

ADR-0069 accepts Vercel for the Next.js BFF and Hetzner Cloud VPS for the API.
The owner reconfirmed that target on 2026-11-27. The current live Render
deployment tracks `develop` and uses Neon `staging`; it is not the final
production release. After product readiness, the owner plans to move the
production release flow to `main` with production configuration. This document
records sequencing and validation; it does not amend the accepted topology.

## Verified repository facts

- `Dockerfile` builds a .NET 10 API image and a static Next.js export in one
  Linux image, then runs as the non-root `app` user.
- `render.yaml` defines a separate Node Next.js service and a Docker API
  service. The API uses `/api/health` as its health check and sets
  `SONIVO_MIGRATE_ON_START=false`.
- Root `compose.yaml` starts PostgreSQL only. `deploy/docker-compose.yml`
  defines API plus Caddy and still describes the accepted Hetzner topology.
- `BillingWorker` and `GroupPurgeReplayWorker` are hosted services in the API
  process and poll durable database state. `DigitizeJobQueue` is intentionally
  in-memory and may lose in-flight work on restart under ADR-0032.
- The current deployment notes require privileged migrations before dependent
  API changes; Render does not enforce that ordering.

## Provider evidence

Provider pages consulted 2026-11-27 for comparison:

| Option | Published capability and price | Consequence / unknown |
|---|---|---|
| Hetzner Cloud VPS (ADR-0069) | Accepted target: Linux VPS + Docker + Caddy + Vercel BFF | Retained by owner confirmation. T-502 must validate server size, region, total cost, backup/IPv4 costs, and operating procedures before cutover. |
| SmarterASP Windows ASP.NET hosting | Advertises ASP.NET Core 10; starts at `$2.95/month` | Not selected. Existing Docker image cannot be assumed to run on shared hosting. Exact WebSocket, port, persistent-worker and recycle guarantees remain unverified. |
| SmarterASP Linux VPS | Advertises Docker and root access; lowest listed VPS is `$49.95/month` (8 GB RAM, 4 CPU cores) | Not selected. Could reuse Linux image, but adds VPS patching, monitoring, backup, proxy and release responsibilities. |
| Current live deployment | Render from `develop`, Neon `staging` | Keep until product readiness and approved `main` cutover; it is not the final production topology. |

Sources: [SmarterASP ASP.NET Core 10 hosting](https://www.smarterasp.net/asp.net_core_hosting/),
[SmarterASP Linux VPS](https://www.smarterasp.net/vps_linux/),
[SmarterASP WebSocket article](https://www.smarterasp.net/support/kb/a1928/how-to-host-web-socket-protocol-application-in-asp_net.aspx),
[Microsoft hosted services](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0),
[Microsoft SignalR hosting and scaling](https://learn.microsoft.com/en-us/aspnet/core/signalr/scale?view=aspnetcore-10.0).

## Proposed direction

1. Keep Render deploying from `develop` during product completion. Keep its
   database on Neon `staging`; do not describe this as the final production
   release.
2. Retain the accepted Vercel Next.js BFF and Hetzner Cloud VPS + Caddy API
   topology in ADR-0069. Move final release ownership to `main` only after the
   product-readiness gate and production environment configuration are
   approved.
3. Reuse the existing Docker image on Hetzner after isolated verification.
   Keep API, SignalR, and hosted workers on one instance initially; do not
   create separate worker services here.
4. Keep the production database on the Neon production branch and blobs on the
   production R2 bucket. Preserve the privileged, separately ordered migration
   process; do not run migrations at API startup.
5. Keep current Render deployment available as rollback until Hetzner passes
   readiness, auth/CSRF, SignalR, RLS, file, worker-restart, and migration
   rehearsal gates.

## Alternatives

- Keep Hetzner, as ADR-0069 already accepts. This matches the owner's confirmed
  direction and requires no superseding host decision.
- Use SmarterASP Windows shared hosting. It advertises .NET 10 at a lower
  starting price, but needs a non-container publish path and plan-specific
  proof for SignalR WebSockets, always-on hosted services, recycle recovery,
  port binding and health probes.
- Select another container host only after comparing cost, operational burden,
  networking and rollback. No additional provider is selected by this draft.

## Remaining validation before cutover

1. T-502 must select and validate the Hetzner server size, region, total monthly
   cost, IPv4/backups, and operational owner before provisioning.
2. Confirm the Neon production branch and production R2 bucket at the `main`
   cutover gate; keep Render available for rollback until rehearsal passes.

## Consequences and scope limits

No provider settings, DNS, secrets, database, or application configuration
change in this proposal. SmarterASP remains a compared but unselected
alternative. Any future host change needs a superseding accepted ADR and a
separate capability-test ticket before migration.


