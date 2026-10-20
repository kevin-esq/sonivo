# PHASE-4.2 — PostgreSQL row-level security

**Status:** ACCEPTED — user-authorized 2026-10-17; [ADR-0086](DECISIONS.md)
supersedes the former RLS prohibition for a second tenant-isolation layer.
**Delivery:** Security phase, ticketed and gated. No policy is enabled until
the runtime-role and transaction-context gates pass.

This phase supersedes the RLS exclusions in the Phase 4.0 and 4.1 specs only
for shared-table tenant row isolation. Their product and item-access scope is
unchanged.

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
other database. The dedicated local/CI bootstrap removes PostgreSQL's default
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
