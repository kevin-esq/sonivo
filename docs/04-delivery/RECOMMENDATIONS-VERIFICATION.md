# Recommendation verification

**Review base:** `origin/develop` at `0357eb1a779a5e051e89a97ec6fe05cbc6e1b36c`, checked 2026-11-22. **Scope:** read-only analysis. Paths and symbols below identify repository evidence; official references are linked directly.

## Critical finding

**FACT:** [`CONTEXT.md`](../00-context/CONTEXT.md) contains an older “Phases 4.0–4.2 authorized” status, while its later delivery summary and [`DEPLOYMENT.md`](../03-architecture/DEPLOYMENT.md) say Phase 4.2 rollout completed through PR #378. `.scratch/NOW.md` also records that closeout. This is a documentation inconsistency, not evidence of an active RLS failure. Reconcile the durable phase status before using it to gate new work.

## R1 — Domains and subdomains

| Recommendation | Classification | Evidence and consequence |
|---|---|---|
| One Next app with host-based `proxy.ts` for all product/auth/account/tenant surfaces | PARTIAL | `web/apps/app` is the product app; `web/packages/routes/src/hosts.ts` centralizes current static host surfaces. ADR-0089/0092 and `docs/03-architecture/DEPLOYMENT.md` describe staged surfaces, but separate deployments/DNS are not all provisioned. Next.js 16 calls the convention `proxy.ts`; it is a routing hook, not proof that all desired host routing exists. See [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) and [upgrading to Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16). |
| Reserve `app`, `auth`, `account`, `api`, `www`, `docs`, etc. | CONFIRMED, already implemented | `src/Sonivo.Domain/Tenancy/GroupSlug.cs` has an authoritative reserved set including those values plus `admin`, `assets`, `billing`, `blog`, `cdn`, `cuenta`, `dashboard`, `dev`, `health`, `help`, `internal`, `join`, `login`, `logout`, `mail`, `settings`, `staging`, `status`, and others. `tests/Sonivo.Domain.Tests/GroupSlugTests.cs` covers reserved slugs. Do not create a duplicate slug feature ticket. |
| Host-only cookie and SessionHandoff, never parent-domain cookie | CONFIRMED, already implemented | `src/Sonivo.Api/Program.cs` configures `options.Cookie.Domain = null`; production cookie uses `__Host-sonivo.session`. `src/Sonivo.Api/Session/SessionHandoffEndpoints.cs` and Session services implement cross-host handoff. ADR-0067/0089 bind the boundary. Keep existing cross-host auth/CSRF tests as gates. |
| Vercel wildcard DNS requires Vercel nameservers | CONFIRMED as provider constraint; deployment decision OPEN | Vercel states wildcard certificates require the Nameservers method for DNS-01 challenge. This does not authorize changing Sonivo DNS. See [Vercel wildcard domains](https://vercel.com/docs/domains/working-with-domains) and [troubleshooting](https://vercel.com/docs/domains/troubleshooting). |

## R2 — Docker and API host

| Recommendation | Classification | Evidence and consequence |
|---|---|---|
| SmarterASP cannot run Docker | PARTIAL / plan-dependent | SmarterASP documents Docker on Linux VPS plans, while shared Linux hosting advertises Node/Python/PHP runtimes and Windows server plans advertise ASP.NET Core. Exact purchased plan and deployment mode remain unverified. Do not claim provider-wide Docker incompatibility. See [Linux VPS](https://www.smarterasp.net/vps_linux/), [Linux hosting](https://www.smarterasp.net/linux_hosting/), and [managed Windows hosting](https://www.smarterasp.net/managed-hosting). |
| API Dockerfile, non-root user, health check | PARTIAL, largely solved | Root `Dockerfile` is multi-stage, targets .NET 10, publishes API and static web output, and runs `USER app`. It has no Docker `HEALTHCHECK`; `render.yaml` probes `/api/health`. Existing image and deployment are active on Render per `DEPLOYMENT.md`. Add no second Dockerfile without a demonstrated target gap. Microsoft documents container health checks as an optional integration: [ASP.NET Core health checks](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks?view=aspnetcore-10.0). |
| Compose API + web + Postgres + Mailpit | PARTIAL | Root `compose.yaml` contains PostgreSQL only on host port 5433. The API image and Render frontend/API services exist. A local all-service stack and Mailpit are not present in this compose file; validate developer friction before adding services. |
| Decide Render, SmarterASP, or another host | CONFIRMED NEED; decision remains OPEN | `docs/03-architecture/DEPLOYMENT.md` says Render currently hosts production from `develop` and SmarterASP is future; accepted ADR-0069 still names a different target topology. A deployment decision must reconcile present operation and accepted target. No host change is part of this plan. |
| Workers and SignalR behavior on host recycle | PARTIAL / operational risk | `GroupPurgeReplayWorker` and `BillingWorker` are registered in `src/Sonivo.Infrastructure/DependencyInjection.cs`; digitization queue is registered in `src/Sonivo.Api/Program.cs`. Hosted services share process lifetime. Microsoft says `StopAsync` is for graceful shutdown and may not run after process failure: [hosted services](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0). SignalR works on ASP.NET Core-supported servers; IIS WebSockets needs IIS 8+ / Windows Server 2012+: [SignalR platforms](https://learn.microsoft.com/en-us/aspnet/core/signalr/supported-platforms?view=aspnetcore-10.0). Verify exact SmarterASP plan and WebSocket behavior before migration. |

## R3 — Fault tolerance

| Recommendation | Classification | Evidence and consequence |
|---|---|---|
| Neon pooled runtime/direct migrations; transaction-local RLS | CONFIRMED mechanism; test scope PARTIAL | `src/Sonivo.Infrastructure/Persistence/EfGroupDatabaseScope.cs` uses `set_config(..., true)` and requires an active transaction. `RlsRequestScopeMiddleware`, `RlsHubTransactionFilter`, integration tests, and `DEPLOYMENT.md` document transaction pooling in current Render use. `DependencyInjection.AddInfrastructure` uses `UseNpgsql(connectionString)` without `EnableRetryOnFailure`. Do not add retries blindly: user-managed transactions and RLS scope must be retried as one unit. See [Neon pooling](https://neon.com/docs/connect/connection-pooling), [EF Core connection resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency), and [transactions](https://learn.microsoft.com/en-us/ef/core/saving/transactions). |
| Health live/ready | PARTIAL, readiness exists | `src/Sonivo.Api/Observability/ObservabilityEndpoints.cs` maps anonymous `/api/health` and `/api/health/ready`; readiness probes PostgreSQL. No distinct `/health/live` route found. Existing deployment probes `/api/health`, while production verification has used readiness. Define semantics before changing probes or public routes. |
| Http resilience for Stripe, SMTP, R2, Whisper | PARTIAL / recommendation too broad | `DependencyInjection.cs` has an `AddHttpClient` for API email transport, and `Program.cs` registers LRCLIB HTTP access; other integrations use non-HTTP SDKs or direct libraries. No shared resilience handler found. Retry eligibility must be decided per operation: avoid retrying non-idempotent writes or duplicating provider side effects. Microsoft documents `Microsoft.Extensions.Http.Resilience` and recommends one handler per client: [HTTP resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience). |
| Outbox for email and notifications; webhook idempotency | PARTIAL / existing patterns | Repo has persisted billing/webhook inbox/outbox state and existing idempotency. Email and notification outbox adoption is not established by the inspected registrations/contracts. ADR-0068 keeps email best-effort; adding delivery guarantees needs an owner decision and per-channel failure semantics. |
| OpenTelemetry/Sentry and uptime monitor | PARTIAL | Structured `ILogger` and health endpoints exist. No OpenTelemetry/Sentry package or external uptime monitor configuration was found in source manifests/deployment docs inspected. Prefer existing `ILogger` + platform logs first; decide on telemetry vendor, data minimization, retention, and cost before adding a package. |
| Secrets and environment matrix | PARTIAL | `render.yaml` declares secret keys with `sync: false`; deployment docs describe current Render and Neon `staging`. No Infisical integration was found. Secret manager choice is owner decision; do not move or expose secrets in this plan. |

## R4 — Multi-client contract

| Recommendation | Classification | Evidence and consequence |
|---|---|---|
| Generated OpenAPI source of truth and generated clients | PARTIAL | `src/Sonivo.Api/Program.cs` calls `AddOpenApi` and conditionally maps `/openapi/v1.json` in Development/Staging. No committed `contracts/openapi.json` or client-generation workflow found. `web/packages/api-client`, Android `ApiEndpoints.kt`/API client, and iOS `MobileEndpoints.swift` contain hand-maintained API code. Do not make a committed contract artifact canonical until generated output, auth, errors, SignalR exclusions, and client compatibility are tested. Microsoft documents named docs; .NET 10 currently describes OpenAPI 3.2 as the default and explicit 3.1 selection. Verify the effective format from pinned package `Microsoft.AspNetCore.OpenApi` 10.0.12 before setting a contract format: [OpenAPI generation](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0). |
| Additive `/v1`, breaking `/v2`, deprecation window | PARTIAL | Current API uses `/api/...`; no global version segment was found. The repository has a proposal but no accepted versioning policy. Versioning changes public routes and mobile/web consumers; owner must approve migration, aliases, and retirement before implementation. |
| Document `MobileVersionGateMiddleware` | PARTIAL, behavior already exists | `src/Sonivo.Api/Auth/MobileVersionGateMiddleware.cs` requires platform/version headers on bearer/token traffic, supports configured minimums and HTTPS store URLs, and emits `400` or `426` with stable codes. `mobile/README.md` documents the policy, but a maintained API contract and tests/docs cross-link should be assessed. |
| OAuth PKCE and secure native token storage | PARTIAL / already adopted | ADR-0093/0094 and native projects establish OIDC Authorization Code + PKCE. `mobile/android` and `mobile/ios` are the native clients. Verify platform secure-storage details before claiming full parity; do not replace auth scheme. |

## R5 — Realtime

| Recommendation | Classification | Evidence and consequence |
|---|---|---|
| Versioned SignalR event protocol, replay/snapshot, reconnection and clocks | PARTIAL / future scope | Three hubs and current events exist; ADR-0036 defines a deliberately thin single Event room and other accepted ADRs govern revocation. No unified versioned wire schema or durable event replay protocol was found. Do not turn the desktop karaoke/DJ proposal into a current hub contract. Any expansion needs a superseding accepted ADR. |
| Offline desktop media cache and DJ controls | PARTIAL | No `desktop/` implementation found. Existing stage mode is in `web/apps/app/src/repertoire/StageOutputPage.tsx` and `stageDisplaySync.ts`, suitable for a bounded discovery spike only. Do not cache copyrighted audio or add MIDI/low-latency features without explicit product and rights decisions. |

## R6 — Desktop

| Recommendation | Classification | Evidence and consequence |
|---|---|---|
| Decide Tauri/Electron/PWA via existing stage-mode spike; write no app yet | PARTIAL | Stage mode and synchronization exist; no desktop app exists. A measurable discovery ticket can test required display count, MIDI/audio-device access, offline requirement, and browser PWA limits. Do not create `desktop/` before an accepted decision. |

## R7 — Repository structure and process

| Recommendation | Classification | Evidence and consequence |
|---|---|---|
| `web/apps/app` still mixes legacy SPA and Next; `app/app` is confusing | PARTIAL | Next route tree is `web/apps/app/app/app/...` because Next's application root is named `app` and product URL namespace `/app` is accepted by ADR-0092. That doubled filesystem segment is not by itself a defect. A real legacy bridge remains: `GroupRouteContent.tsx` imports `LegacyRouterBridge`, and legacy adapters remain in `src/`. Plan a route-by-route migration, not mass deletion. |
| `mobile/` and `web/apps/mobile/` duplicate clients | REFUTED | `web/apps/mobile/package.json` describes itself as a compatibility pointer to native clients under root `mobile/`; it is not duplicate app code. No cleanup ticket. |
| `.scratch/shots/` contains about 110 tracked PNGs | CONFIRMED, count corrected | `git ls-files .scratch/shots` reports 102 tracked PNG files on this base. Ignore and index removal are not implemented here; a separate ticket must preserve local files and avoid rewriting Git history. |
| Root and `docs/` PRODUCT/DESIGN are duplicates | PARTIAL / not equivalent | Root `PRODUCT.md` differs from `docs/01-product/PRODUCT.md`; root `DESIGN.md` differs from `docs/design/DESIGN_SYSTEM.md`. Compare purpose, freshness, inbound links, and ownership before choosing canonical text or deleting either. |
| `docs/03-architecture` mixes specifications, research, audits, runbooks | CONFIRMED | Directory contains phase specs, research, audits, and runbooks in one flat directory. Reorganization is documentation-only but link-sensitive; separate taxonomy/link migration tickets are required. `DECISIONS.md` is canonical ADR ledger, so do not relocate it to a parallel directory under this plan. |
| ChordPro parser needs its own project | REFUTED as a current requirement | Parser code lives under Application; ADR-0030 and architecture already define its role. No second production consumer or independent deployment seam was verified. A separate project adds build/release coupling without demonstrated reuse. Revisit only if another host/client needs it. |
| Group purge classes are misplaced under Payments | CONFIRMED | `src/Sonivo.Infrastructure/Payments/GroupPurgeReplayWorker.cs` and `GroupPurger.cs` are tenancy/data lifecycle concerns, not payment behavior. A namespace/folder-only move is a small candidate, subject to DI and tests. |
| Add `Directory.Packages.props`, `global.json`, architecture tests | PARTIAL | No `Directory.Packages.props` or `global.json` found. `tests/Sonivo.Integration.Tests/GroupIsolationArchitectureTests.cs` already enforces architecture/security constraints. Add only missing guardrails demonstrated by dependency drift or SDK inconsistency. `NetArchTest` is MIT according to its [official repository](https://github.com/BenMorris/NetArchTest); no dependency is recommended until a gap proves the custom tests insufficient. |
| Rename cryptic E2E files by feature | PARTIAL | `e2e/tests` has descriptive files and legacy names such as `w1-shell.spec.ts`/`w22-notifications.spec.ts`. Rename only with references/report artifacts and Playwright configuration updated in the same narrow ticket. |
| Extract UI-free player core | PARTIAL / reuse unproven | Practice playback and stage timing code live under `web/apps/app/src/repertoire`; no `player-core` package or desktop consumer exists. First map boundaries and prove a second consumer before extraction. |
| Per-area AGENTS, CONTRIBUTING, SECURITY, CODEOWNERS, issue templates, live index | PARTIAL | Root `AGENTS.md`, `docs/00-context/INDEX.md`, and `docs/03-architecture/SECURITY.md` exist. No root `CONTRIBUTING.md`, `CODEOWNERS`, or issue templates were found. Per-folder instructions should be added only where local ownership/testing cannot be learned from root docs; avoid boilerplate. |
| Path-filtered CI, iOS macOS job, release tags/changelogs | PARTIAL | `.github/workflows/ci.yml` runs backend, frontend, and Playwright jobs; CodeQL/security workflows exist. No iOS macOS build/release workflow or area release scheme was found. Path filters risk skipping cross-area validation; add only after dependency mapping and required-check semantics are explicit. |

## Language audit (documentation only)

**FACT:** Reviewed Markdown inventory: 220 files under `docs/`, `.scratch/`, and `.agents/skills/`. Accent-word scans are candidate finders, not a language classifier. Manual review found these files with Spanish prose or mixed-language body text; sizes are approximate bytes from current base:

| Path | Language / size | Canonicality |
|---|---|---|
| `docs/01-product/GATE-B-DESIGN-BRIEF.md` | Spanish, ~6.0 KB | Historical design input; verify links/decision status before translation. |
| `docs/03-architecture/PLAN_IMPLEMENTACION_MASTER.md` | Spanish, ~5.4 KB | Historical plan; predates current accepted ADR ledger. |
| `docs/03-architecture/PAYMENTS-BILLING-MEXICO-LEGAL-READINESS-2026-11.md` | Spanish, ~11.3 KB | Legal-readiness analysis; meaning needs careful preservation and owner/legal review. |
| `docs/03-architecture/SONG-EDITOR-OPEN-SOURCE-RESEARCH.md` | Spanish, ~25.0 KB | Historical research; preserve cited evidence and language of quotes. |
| `docs/tooling/SECURITY-SWEEP-PROMPT.md` | Spanish, ~8.7 KB | Reusable project procedure; translate without changing security scope. |
| `.agents/skills/creative-frameworks/SKILL.md` | Spanish, ~1.9 KB | Active project-local skill; translation changes agent behavior and needs review. |
| `.scratch/security-sweep-26df6f5/SECURITY-SWEEP-DEVELOP-26df6f5.md` | Spanish/mixed, ~19.8 KB | Historical audit checkpoint. |
| `.scratch/security-sweep-26df6f5/REMEDIATION-PLAN-DEVELOP-26df6f5.md` | Spanish/mixed, ~5.6 KB | Historical remediation plan. |
| `.scratch/NOW.md` | Mostly English, contains historical Spanish passages, ~71.8 KB | Current continuity file with accumulated historical entries; translate in bounded segments without deleting history. |

English documents containing Spanish UI labels or quoted user copy are not language violations; locale files and user-generated fixtures must remain unchanged. The user-provided local `docs/00-context/PROJECT-STRUCTURE.md` is outside this branch and was not included in its tracked-base inventory; prior task context identifies it as Spanish. Treat it as local-only pending confirmation of its intended canonical status. This audit does not translate existing files because the current scope permits only the new delivery documents and the two named continuity updates.

## Additional verified findings

- **FACT:** `docs/00-context/CONTEXT.md` has stale phase wording against its own updated delivery summary and current deployment runbook. See Critical finding above.
- **FACT:** `Dockerfile` already combines the static Next export and .NET API image and runs as `app`; `compose.yaml` is PostgreSQL-only. The recommendation to “Dockerize both” is already mostly done for deployment, not local full-stack development.
- **FACT:** `docs/03-architecture/DEPLOYMENT.md` records current Render production on `develop` and Neon `staging`, future SmarterASP, while accepted ADR-0069 describes a different target. Owner’s launch timing and future host choice remain decision gates.
- **FACT:** Repo phase-gate instructions say Phase 0–3.9 closed and explicitly prohibit speculative CQRS/event sourcing. This plan creates no CQRS or event-sourcing ticket.
- **OPEN QUESTION:** Should historical `.scratch` reports and large skill/reference docs be translated in place, or archived with a short English index? User policy requires preserving meaning; owner must pick archive/translation treatment per ticket.

## Official references consulted

Microsoft Learn: [.NET 10 OpenAPI generation](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0), [health checks](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks?view=aspnetcore-10.0), [hosted services](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0), [SignalR supported platforms](https://learn.microsoft.com/en-us/aspnet/core/signalr/supported-platforms?view=aspnetcore-10.0), [EF Core connection resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency), [HTTP resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience), [Docker deployment](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/docker/?view=aspnetcore-10.0). Provider/platform sources: [Vercel domains](https://vercel.com/docs/domains/working-with-domains), [SmarterASP Linux VPS](https://www.smarterasp.net/vps_linux/), [SmarterASP Linux hosting](https://www.smarterasp.net/linux_hosting/), [Neon pooling](https://neon.com/docs/connect/connection-pooling), [Neon branching and restore history](https://neon.com/docs/introduction/branching). Consulted 2026-11-22. Package/license check: [NetArchTest (MIT)](https://github.com/BenMorris/NetArchTest) and [Microsoft.Extensions.Http.Resilience 10.11.1 (MIT)](https://www.nuget.org/packages/Microsoft.Extensions.Http.Resilience/10.11.1). These are comparisons only; no dependency is selected or required by this proposal.
