# PHASE-4.2 — PostgreSQL row-level security

**Status:** ACCEPTED — user-authorized 2026-10-17; [ADR-0086](DECISIONS.md)
supersedes the former RLS prohibition for a second tenant-isolation layer.
**Delivery:** Security phase, ticketed and gated. No deployed environment is
considered RLS-secured until runtime-role, transaction-context, policy-coverage,
and exception-flow gates pass.

## Historical implementation checkpoint — 2026-11-14

**Status:** IN PROGRESS; staging rollout remains blocked.

- A local migration now enables and forces RLS for all 22 reviewed
  Group/user-owned tables. Billing and financial tables remain excluded.
- The migration and runtime-role verifier pass on isolated PostgreSQL 16.6.
  The complete solution passes **936/936**: Domain 251, Application 254,
  Integration 110, and API 321 with `sonivo_app` used for PostgreSQL tests.
- Added policy tests cover table coverage, selected and multi-Group reads,
  cross-Group write denial, public-slug lookup, invitation-token lookup, and
  authenticated Group bootstrap.
- Staging Neon currently has only through
  `20261114164400_AddBillingLegacyGroupNotices`, four Groups, and four Billing
  Organizations. It has no `sonivo_app` or `sonivo_rls_reader` login/role;
  its available login `neondb_owner` has `BYPASSRLS`. Applying policies before
  provisioning and validating the runtime role would not provide RLS isolation.
- The additive `BillingAdministrationAndSuspension` migration is also missing
  from staging. It must precede the RLS migration.
- T-4.2.04–07 remain open. The isolated suite does not yet prove every
  exceptional, background, realtime, export, FK/constraint, pooled-connection,
  and deployment path. Do not enable the administrative API or call staging
  secure until these gates pass.

This phase supersedes the RLS exclusions in the Phase 4.0 and 4.1 specs only
for shared-table tenant row isolation. Their product and item-access scope is
unchanged.

## Rollout checkpoint — 2026-11-21

**Status:** Local/CI implementation gates for table inventory, transaction
scope, policies, isolation tests, and exception flows are complete. The owner
confirms Render production uses Neon `staging`; a Neon connection as
`sonivo_app` passed the runtime-role verifier there. The latest migration is
applied; production readiness returns 200. T-4.2.07 remains active for review
of the operational checkpoint and migration procedure.

- The owner confirms Render is the current production host and SmarterASP.NET
  is a future destination. Render production uses Neon branch `staging`. The
  Render `sonivo` service currently tracks
  `develop`, auto-deploys commits, uses `./Dockerfile`, and serves
  `/api/health`. The latest observed live deployment is `d6853c0`. The owner
  reports `SONIVO_MIGRATE_ON_START=false`; `render.yaml` also sets it to false.
- That active production database has 52 public tables. All 22 reviewed RLS tables
  have RLS enabled and forced, with 85 policies. A read-only run of
  `scripts/db/verify-runtime-principal.sql` through a Neon connection using
  `sonivo_app` passed there. This does not prove Render's configured login.
  Migration `20261120200916_AllowCurrentSlugPublicBranding` from PR #374 is
  now recorded as the latest migration. It was applied with its exact `Up` SQL
  and EF history row in one privileged Neon transaction, not through
  `dotnet ef`. The same operation passed `Up`/`Down` rehearsal on an isolated
  copy; that temporary branch and endpoint were removed afterward.
- The Neon branch named `production` had 25 public tables, no `sonivo_app` or
  `sonivo_rls_reader` roles, and no RLS policies when inspected. That read
  resumed the previously archived branch; it is now `ready`. No schema or data
  was changed. The owner confirms this branch is not Render's active database.
- Owner decision (2026-11-21): keep Render auto-deploying `develop` while the
  main product is being completed. Afterward, move the production release flow
  to `main` and publish with the required production configuration. This is a
  rollout direction; no Render settings were changed.
- The repository has no production migration workflow that blocks or sequences
  Render's auto-deploy. The current migration was applied manually as a
  privileged transaction. Before the next schema change, define and enforce
  migration and runtime-verification ordering.
- **T-4.2.07 gate:** future migrations must use the separate privileged
  deployment procedure in `DEPLOYMENT.md`; verify runtime principal and policy
  coverage without exposing credentials; define migration ordering before the
  next schema change; finish incident and recovery guidance before marking the
  ticket complete. Production release through `main` is deferred until the
  product is ready.

The API image already exists and Render runs it as Docker. Do not enable
migration on API startup. Future schema changes remain gated on the separate
migration role and an approved rollout.

## Goal

Add a fail-closed PostgreSQL boundary that prevents a constrained application
database role from reading or writing another Group's rows when an application
query accidentally omits its Group predicate. Preserve application
authorization as the authority for membership, RBAC, item grants, and writes.

## Binding principles

1. `Group` remains the only authorization tenant. Every Group API still checks
   membership and the required capability on every request.
2. Application queries and stores remain explicitly Group-scoped. RLS does not
   justify ambient EF filters, a `TenantId` column, tenant claims, or trusting
   a route/host Group id.
3. Database request context is transaction-local, established from a validated
   authenticated principal and verified Group scope before tenant data access.
   Missing, malformed, or stale context denies access.
4. Policies must check membership as well as any selected Group context.
   Multi-Group user views need a defined user-scoped policy path.
5. The application runtime role is neither table owner nor superuser and has
   no `BYPASSRLS`. Migrations use a distinct privileged role. Pool reset stays
   enabled.
6. Policy coverage includes every tenant-owned table, including indirect
   ancestry such as `Resource` through `Arrangement`. Global platform records
   are inventoried and excluded only with a written ownership reason.
7. Public branded login, invitation acceptance, Group bootstrap, background
   jobs, report/export flows, and SignalR get explicit least-privilege designs.
   Do not add broad policy bypasses to make these flows work.
8. RLS is defense in depth, not an authorization source or a boundary against
   arbitrary SQL executed with the runtime credential.

## Tickets and gates

### T-4.2.01 — Tenant table and flow inventory

**Status:** COMPLETE — EF/schema inventory, live local catalog reconciliation,
the 133-row Program.cs route inventory, endpoint extensions, and the
operation-level policy matrix were reviewed against the source and recorded in
[`POSTGRESQL-RLS-RESEARCH.md`](POSTGRESQL-RLS-RESEARCH.md). T-4.2.05 still owns
the PostgreSQL adversarial tests for those proposed predicates; this ticket
does not authorize policy rollout before the other gates pass.

- Inventory each table/model with direct Group ownership, indirect Group
  ownership, user/global ownership, or intentional public-read behavior.
- Map every HTTP route, background service, hosted job, and hub to its
  transaction and identity context. Include multi-Group dashboards, branding,
  handle/slug login, invitation accept, Group creation, and data export.
- Deliver a reviewed policy matrix with read/write predicates and exceptions.
- Invitation creation uses the existing token-backed join link and does not
  create a Group notification for a pre-member. `Notifications` is recipient-
  owned: row policies bind it to the recipient, while the Group inbox API also
  verifies current membership. Group notifications may only target a verified
  member; insert policies also require the authenticated actor and recipient
  to be members of the selected Group. Task create/update paths validate the
  assignee membership before persisting the assignment or notification.
- **Gate:** no policy migration starts while any table or access path is
  unclassified.

### T-4.2.02 — Database principal separation

**Status:** IN PROGRESS — local and fresh PostgreSQL 16.6 runtime principals
and reviewed table grants are provisioned and verified; the full local
CI-equivalent Release suite passed **828/828** with the constrained runtime
role (2026-10-17). The read-only runtime verifier now checks the complete
reviewed public-table inventory and exact per-table privilege matrix. It
requires `session_user = current_user = sonivo_app`, so a different login
cannot pass by using `SET ROLE`; rejects database ownership, privileges
beyond `CONNECT` on the application database, and effective `CONNECT` to any
other application database. Neon-managed `postgres`, `template0`, and
`template1` are exempt because their `PUBLIC CONNECT` ACL is provider-owned.
The verifier permits only Neon's non-inheriting `neondb_owner` membership edge
to the NOLOGIN helper role; `sonivo_app` cannot inherit or assume that role.
The helper has no schema `CREATE` privilege after function ownership transfer.
The dedicated local/CI bootstrap removes PostgreSQL's default
`PUBLIC` `CONNECT` on other databases and `TEMPORARY` on the application
database. It also rejects unsupported public relation types,
public routines, unreviewed public tables, `PUBLIC` table grants, column-level
grants to the runtime or `PUBLIC`, `CREATE`/`USAGE`/ownership in unreviewed
application schemas, role
memberships, sequence privileges, unsafe role attributes, grant options, table
ownership, and migration-history access. It runs in local setup and both CI
database jobs.
Local positive verification passes. Transactional negative checks proved it
rejects a `TRUNCATE` grant, a grant option, a `PUBLIC` table and column grant,
an unreviewed public table, inherited `TEMPORARY`, a view, and a routine; each
probe was rolled back. A temporary `CONNECT` grant to `sonivo_test` was also
rejected and revoked; the positive check passed afterward. It also rejects a
`sonivo` login that runs `SET ROLE
sonivo_app`, a `CREATE`-only grant on an unreviewed schema, and `USAGE` on a
schema named `pgaudit`, which verifies the internal-schema prefix check treats
the underscore literally. The live schema probe was removed after rejection.
The focused
`RlsTransactionScopeTests` suite passes **16/16**, including
the regression for a failed post-commit action.
The authenticated browser's live Roles reload was observed alongside
`pg_stat_activity`; API traffic used the local `sonivo_app` principal. A second
isolated Development API startup with an explicit local runtime connection also
read Data Protection keys as `sonivo_app` and was shut down afterward.
GitHub-hosted CI is unrun. This repository has no
production migration workflow; production migrations must run as an
operator-controlled one-shot job from an approved release. A read-only Npgsql
preflight against the ignored production credential profile validated TLS with
`VerifyFull`, but the connected role is not `sonivo_app`: it is not a
superuser, but has `BYPASSRLS` and `CREATEROLE` and owns public tables/sequences.
`sonivo_app` is absent. The preflight also found that `GroupRoles`,
`ResourceGrants`, `WebhookEvents`, and `Notifications` are missing from that
profile's schema, so the reviewed grants cannot yet be applied. The local
ignored profile now uses `VerifyFull`, but that does not prove or change the
deployed API identity. Apply only the approved schema migrations through the
separate migration job, provision and wire the constrained production runtime
role with the reviewed grants, then pass the verifier against the actual
deployment configuration before closing this ticket.

The current release batch adds four OpenIddict persistence tables for mobile
OIDC. They are included in the exact public-table inventory; the runtime role
has only the operations used by the registered-client, authorization, token,
and scope stores. The first PR CI verifier run correctly rejected the missing
inventory entries. After adding the reviewed matrix and grants, the local
PostgreSQL 16.6 verifier passed as `sonivo_app`; GitHub CI rerun is pending.

- Create/document a non-owner, non-superuser, `NOBYPASSRLS` runtime principal
  with only required DML privileges and a separate migration/ownership
  principal.
- Update Compose, local setup, CI migrations/API launch, deployment settings,
  and operational docs without committing secrets.
- Prove the actual connected principal in local and CI PostgreSQL.
- **Gate:** API tests do not run as owner, superuser, or `BYPASSRLS`.

### T-4.2.03 — Transaction-bound request scope

**Status:** COMPLETE locally — HTTP API transactions install the authenticated user
context; GroupAccessService sets Group scope only after membership succeeds;
SignalR invocations use a per-method hub filter. Digitize background work now
uses the initiating principal and rechecks permission in a short transaction
before it reads blob data. Middleware commits its owned transaction on response
start, before streamed bytes are sent. Invitation token lookup now uses a
transaction-local token-hash scope, and anonymous handoff redemption establishes
a bounded operation for the user from its consumed single-use ticket. Public
branding, handle login, and Group bootstrap slug lookup now use short
purpose-limited transactions. Authenticated Group-by-slug and tenant handoff
lookups use an exact slug selector before the handler verifies membership. The
cross-Group summary and own-data export endpoints set a separate
transaction-local user selector. Ordinary Group queries with neither verified
Group nor this explicit summary selector will deny once policies are enabled.
PracticeRoom hub calls set an exact transaction-local Event id before resolving
the Event's Group; the proposed Event policy also requires membership in that
Group. The authorizer then repeats membership verification and sets verified
Group scope before permission checks. Per ADR-0087, a committed Membership
removal or leave also revokes the user's Group realtime connections and removes
their PracticeRoom participants; outbound messages target only currently
authorized in-memory connections. Joins recheck membership after registering
to close the authorization/revocation race.
The request middleware
skips `.AllowAnonymous()` endpoints even when a cookie is present. Signed
payment webhooks now set Group scope only in the dedicated payment-webhook
context from the verified provider event, and atomically deduplicate the
platform event with the optional Group billing update. Verified password-reset
and external-login audit writes establish the verified account's user scope
before inserting account audit rows. RLS predicate behavior still needs real
policy tests. Resource uploads attempt blob cleanup with a non-canceled token
if upload or database persistence fails. A PostgreSQL integration test now
cancels during a partial write through the filesystem blob provider and proves
the partial blob and Group operation are rolled back. Multi-Group RLS
verification remains policy-gated.

A PostgreSQL transaction regression models membership deletion together with
realtime revocation: a committed delete removes active connections after commit,
while a 403 rollback preserves both the row and active connection. Focused
integration coverage passes; policy-enabled cross-Group behavior stays gated
for T-4.2.05.

The full local Release solution suite passes **811/811** (Domain 198,
Application 236, Integration 88, API 289), including PostgreSQL tests for
transaction cleanup, selector reuse, background scope, hub invocation success
and failure, and post-commit membership revocation. This closes the local
T-4.2.03 gate; row-policy denial remains T-4.2.05.

- Design and implement a scoped database access boundary that starts or joins
  an explicit transaction, sets authenticated user and verified Group context
  transaction-locally, and covers all EF queries and writes in the operation.
- Handle existing explicit transactions, retries/execution strategies, and
  cleanup/disposal. Never depend on connection-session state or disabled pool
  reset.
- Current Npgsql configuration uses the provider's non-retrying strategy.
  Middleware and hub pipelines must not be replayed as whole units because
  application handlers may have external side effects. A PostgreSQL integration
  test guards this configuration. The bounded background metadata read uses
  EF's execution strategy and contains no blob/transcription side effects; those
  run only after its transaction returns.
- Implement separate, bounded contexts for multi-Group queries and
  non-member/public bootstrap flows identified in T-4.2.01.
- Include SignalR hub invocations and any background processing that touches
  Group data.
- Track active GroupHub connections and PracticeRoom participants by verified
  `(GroupId, UserId)`. After membership removal commits, revoke those
  connections from realtime fanout. Outbound messages target only active
  registry/state entries, not a SignalR group. A failed/rolled-back removal
  must not revoke them. Join methods perform a second membership check after
  registering their connection.
- **Gate:** prove every context setter requires a real transaction and that
  selectors do not survive commit, rollback, connection reuse, cancellation, or
  exception. Prove malformed authenticated principals are rejected before data
  access, and prove committed membership removal evicts active realtime
  connections while rollback preserves them. Empty/missing context denial is verified by T-4.2.05 after the
  complete policies are installed; it cannot be demonstrated in this ticket
  while no RLS policy exists.

### T-4.2.04 — Complete policies and migration

- Add enable/force RLS and least-privilege `SELECT`, `INSERT`, `UPDATE`, and
  `DELETE` policies for every approved tenant table using the reviewed matrix.
- Apply `USING` and `WITH CHECK` rules consistently; preserve parent scope for
  nested tables. Keep SQL grants separate from row policies.
- Add catalog-based coverage checks so a future Group-owned table cannot ship
  without policy review.
- Review FK/unique constraint side channels and ensure errors do not disclose
  another Group's row state.
- **Gate:** migration and rollback behavior are reviewed on a copy of current
  schema/data; no partial-coverage state is represented as secure.

### T-4.2.05 — PostgreSQL isolation matrix

- Use live PostgreSQL with the constrained runtime role to prove cross-Group
  reads and writes are denied when filters are omitted, scope is missing,
  scope is malformed, and a caller selects a non-member Group.
- Prove correct members retain expected access, multi-Group views remain
  complete for their memberships, and roles/item grants still restrict what
  RLS permits at row level.
- Cover `Resources` ancestry, owner/migration bypass boundaries, FK/unique
  behavior, transaction rollback, and pooled connection reuse.
- **Gate:** no in-memory substitute counts as RLS verification.

### T-4.2.06 — Public, bootstrap, and realtime flows

- Prove branded unauthenticated reads expose only intentionally public fields;
  invitation lookup/acceptance cannot enumerate or access unrelated Group
  records; Group creation can insert only the newly created Group and its
  initial Owner membership.
- Prove PracticeRoom, Group, and Notification hubs establish and clear the
  same authenticated scope for each invocation.
- Prove user exports, audit, reports, and background execution obey their
  existing authorization and data boundaries.
- **Gate:** each exception has a bounded operation and negative-path tests;
  no connection-wide or broad table bypass.

### T-4.2.07 — Rollout and operational verification

- Roll out only after all preceding gates pass, with migration order,
  deployment-role validation, observability, and a tested rollback/forward-fix
  plan.
- Verify production configuration without exposing connection strings or
  secrets; fail deployment/startup if the runtime role has forbidden
  attributes or required policies are missing.
- Update security, architecture, local development, CI, and incident guidance.
- **Gate:** operators can identify the active principal and policy coverage
  without exposing secrets; RLS is verified against the deployed configuration.

## Exclusions

No ambient EF query filter or tenant context; no JWT or tenant claims; no
replacement for `GroupAccessService`; no change to Group/Organization domain
boundaries; no RLS-based custom-role or item-grant authorization; no general
cross-tenant admin access; no broad `SECURITY DEFINER` API surface.
