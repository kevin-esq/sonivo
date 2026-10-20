# PostgreSQL RLS research for Sonivo

**Date:** 2026-10-17
**Decision:** [ADR-0086](DECISIONS.md)
**Status:** Research complete; implementation is gated by Phase 4.2.

## Question

Should Sonivo add PostgreSQL row-level security (RLS) on top of its existing
application-enforced Group membership and authorization model?

## Finding

RLS is useful defense in depth for Sonivo if it is applied to every Group-owned
table and every application connection uses a constrained runtime role. It can
deny rows when a query accidentally omits a Group predicate. It does not
replace the application's membership, RBAC, or item-grant checks. It also does
not protect against a compromised application credential or arbitrary SQL
running as the application role when the application can set the same custom
session values used by policies.

RLS is not effective under the current local/CI database role configuration:
the `sonivo` database role is a superuser with `BYPASSRLS`. PostgreSQL also
lets table owners bypass policies unless row security is forced, while
superusers and `BYPASSRLS` roles always bypass. A separate runtime role and
privileged migration/ownership role are prerequisites, not cleanup work.

## Evidence from this repository

- Tenant ownership is `Group`; users may belong to multiple Groups through
  `Membership`. Authorization is already checked by `GroupAccessService` and
  tenant stores carry explicit Group scope (ADR-0079).
- Direct `GroupId` columns exist on Membership, audit, branding, invitations,
  roles, grants, repertoire, scheduling, and task tables. `Resource` has no
  direct GroupId and is scoped through its Arrangement; `Rsvp` is scoped
  through its Event. Global Identity and account records have different
  ownership semantics.
- `/api/groups` aggregates multiple Groups for one authenticated user. Public
  branded login and invitation acceptance operate before ordinary membership
  authorization. Group creation establishes the Group and initial Owner
  membership. SignalR hubs access Group data outside the ordinary HTTP request
  pipeline.
- Before T-4.2.02, local Compose and CI used `sonivo` for application and
  privileged database work. Local inspection showed that role has `rolsuper`
  and `rolbypassrls`; local API configuration now uses the constrained
  `sonivo_app` role, and CI has the same split configured but not yet executed.
- EF Core may create a transaction for `SaveChanges` when needed, but a
  transaction-local policy context must exist before the first tenant query.
  Existing multi-step transactions and realtime flows need explicit coverage.
- Live PostgreSQL 16.6 catalog reconciliation found 29 tables in `public`
  (28 application/platform tables plus `__EFMigrationsHistory`), all owned by
  `sonivo`; the catalog had no sequences. No table had RLS enabled/forced and
  no policies existed, as expected before T-4.2.04. The runtime `sonivo_app`
  role is non-superuser, non-owner, and `NOBYPASSRLS`.
- The prior local runtime role had broad DML on every public table, including
  the migration history and append-only audit/webhook ledgers. The reviewed
  allowlist in `scripts/db/grant-runtime-privileges.sql` now gives business
  Group tables required DML, audit/webhook tables SELECT+INSERT, notifications
  SELECT+INSERT+UPDATE, Identity tables DML, and Data Protection keys
  SELECT+INSERT+DELETE. It grants no runtime privileges on migration history.
  A fresh-database privilege integration test guards this boundary.
- A follow-up catalog check found effective database `TEMPORARY` and inherited
  `CONNECT` to `postgres`, `sonivo_test`, and `template1` on `sonivo_app`, from
  PostgreSQL's default `PUBLIC` database ACL. The runtime verifier now requires
  `CONNECT` only on the application database and rejects effective `CONNECT`
  to every other connectable database; it also rejects `CREATE`/`TEMPORARY`
  on the database, unreviewed schema `USAGE`/`CREATE`/ownership, column grants, unsupported public
  relations, and public routines. The dedicated local/CI bootstrap revokes
  `TEMPORARY` from `PUBLIC` on the application database and `CONNECT` from
  `PUBLIC` on other databases in its dedicated cluster. Production provisioning
  must ensure the runtime login has no effective `CONNECT` to other databases;
  this can require removing inherited `PUBLIC` access or using a dedicated
  cluster. The verifier requires both `session_user` and
  `current_user` to be `sonivo_app`, so `SET ROLE` cannot make another login
  pass the direct-connection check. The local migration helper always pins its
  design-time connection to Compose and ignores inherited external migration
  connection values. This closes an otherwise implicit capability:
  PostgreSQL documents that a session's temporary schema is searched first
  for relation and type names when it exists. Sources: [PostgreSQL 16
  privileges](https://www.postgresql.org/docs/16/ddl-priv.html), [PostgreSQL 16
  client connection defaults](https://www.postgresql.org/docs/16/runtime-config-client.html),
  [PostgreSQL 16 system information functions](https://www.postgresql.org/docs/16/functions-info.html),
  and [PostgreSQL 16 column catalog](https://www.postgresql.org/docs/16/catalog-pg-attribute.html).

## Initial table ownership inventory

This inventory is based on the current EF model and PostgreSQL schema and has
been reconciled with the local PostgreSQL 16.6 catalog. Source review for
T-4.2.01 is complete: proposed predicates and exceptional operations are
recorded in the matrix below. PostgreSQL policy enforcement remains untested
until the gated T-4.2.04–06 work.

| Table(s) | Ownership | Required policy shape |
| --- | --- | --- |
| `Groups` | Group root, keyed by `Id` | Member reads; authenticated bootstrap create for the newly generated Group; membership-gated update/delete |
| `Memberships` | Group-owned; some login/acceptance flows need pre-membership lookup | Member reads/writes; bounded handle-login and invitation operations need narrow lookup paths |
| `GroupSlugHistory`, `GroupBranding`, `GroupRoles`, `Invitations`, `GroupAuditLog`, `ResourceGrants`, `Songs`, `Arrangements`, `Tasks`, `Setlists`, `SetlistItems`, `Events`, `EventSetlistItems` | Direct `GroupId` | Policies check authenticated membership and any transaction Group selector; role/action checks remain in application |
| `Resources` | Indirect through `Arrangement.GroupId` | Policy checks parent Arrangement membership; direct resource id is never sufficient |
| `Rsvps` | Indirect through `Event.GroupId`; the row stores only `EventId` and `UserId` | Policy joins the parent Event and applies membership plus selected or multi-Group scope; writes bind the RSVP to the authenticated user |
| `Notifications` | Recipient-owned rows with optional Group context | RLS binds every notification row to its recipient; the API additionally requires current membership to list or count a Group inbox |
| `AccountAudit` | User-account events with optional Group attribution | Reads are target-owned; actor attribution alone grants no read visibility. Inserts are self/target-bound and Group-scoped when `GroupId` is present. |
| ASP.NET Identity tables, `DataProtectionKeys`, `WebhookEvents` | Platform/global | No Group policy; retain their existing least-privilege and application access rules |
| Object/blob storage | Outside PostgreSQL rows | Existing application authorization must run before reading opaque blob keys |

The live catalog's complete 29-table list is classified below. The first 28
are application/platform tables; `__EFMigrationsHistory` is migration-owned.

| Catalog tables | Ownership | Policy family |
| --- | --- | --- |
| `Groups`, `GroupSlugHistory`, `GroupBranding`, `GroupRoles`, `Memberships`, `Invitations`, `GroupAuditLog`, `ResourceGrants`, `Songs`, `Arrangements`, `Tasks`, `Setlists`, `SetlistItems`, `Events`, `EventSetlistItems` | Group root and direct `GroupId` ownership (15 tables total) | Group membership and verified Group context; bootstrap, invitation, and handle-login exceptions require bounded predicates |
| `Resources`, `Rsvps` | Group-owned through `Arrangements` and `Events`, respectively | Parent Arrangement or Event ancestry predicate; never authorize from child id alone |
| `Notifications` | User-owned | Current authenticated user only; no Group selector |
| `AccountAudit` | User/account-owned with optional Group attribution | Target-only reads; actor attribution alone grants no read visibility |
| `AspNetUsers`, `AspNetUserClaims`, `AspNetUserLogins`, `AspNetUserRoles`, `AspNetUserTokens`, `AspNetRoles`, `AspNetRoleClaims` | Identity platform tables | Existing Identity operations only; keep separated from Group authorization |
| `DataProtectionKeys` | Application platform | Runtime key persistence only |
| `WebhookEvents` | Payment platform | Signed webhook processing; narrowly scoped platform access |
| `__EFMigrationsHistory` | Migration role | No `sonivo_app` privilege |

## Source-reviewed predicate matrix (policy implementation remains gated)

The following predicates are the proposed row boundary to implement and prove
with PostgreSQL in T-4.2.04–06. They are separate from application
permissions: a row allowed by RLS must still pass `GroupAccessService`, the
role capability, and (for repertoire) the hierarchy grant check.

Define `U` as the non-empty transaction-local `sonivo.user_id` and `G` as the
optional transaction-local `sonivo.group_id`; the server installs both. Define
`M(u, g)` as an exact membership existence check for a non-empty `UserId` and
`GroupId`. Policies must use one narrowly scoped `SECURITY DEFINER` membership
helper to avoid recursive evaluation of the `Memberships` policy. Implement it
with a dedicated `NOLOGIN`, `NOBYPASSRLS`, non-table-owner role (for example,
`sonivo_rls_reader`) that receives `SELECT` only on the `UserId` and `GroupId`
columns of `Memberships`. A policy scoped `TO sonivo_rls_reader` gives that
role the rows needed by the helper; the runtime role must not be a member of
the helper role and cannot `SET ROLE` to it. The function belongs to the helper
role, sets `search_path = pg_catalog, pg_temp`, and fully qualifies the
`public."Memberships"` table. No writable schema appears in its path. Create the function, revoke default `PUBLIC`
execution, and grant execution only to `sonivo_app` in one transaction. The
helper role owns neither tenant tables nor other security-definer routines,
and has no broad DML or policy bypass. No endpoint or general table bypass is
permitted.

This shape is based on PostgreSQL's documented use of security-definer
functions inside policy expressions to read a protected relation and its
requirements for a trusted `search_path` and transactional removal of default
`PUBLIC EXECUTE`. The helper's reader policy avoids recursive Membership
lookups without making the runtime principal a reader role. The function must
derive the user from transaction-local `sonivo.user_id`, return false for
missing context, and check one Group id. [PostgreSQL row security policies](https://www.postgresql.org/docs/16/ddl-rowsecurity.html),
[CREATE FUNCTION security guidance](https://www.postgresql.org/docs/16/sql-createfunction.html),
[CREATE POLICY](https://www.postgresql.org/docs/16/sql-createpolicy.html).

For a direct-`GroupId` table, normal `SELECT` is `M(U, row.GroupId) AND
(G = row.GroupId OR sonivo.multi_group_user_id = U)`. The selected-Group path
starts only after `GroupAccessService` verifies membership. The multi-Group
path is separately enabled only by four cross-Group endpoints: `/api/groups`,
`/api/activity/upcoming`, `/api/activity/calendar`, and `/api/auth/export`.
A request with neither selector sees no Group rows. `Memberships` also permits `UserId = U` for the
single-row membership check that precedes Group verification; the current user
cannot read other members until `G` or the explicit multi-Group selector is
set. Normal `INSERT` uses `WITH CHECK`, normal `UPDATE` uses both `USING` and
`WITH CHECK`, and normal `DELETE` uses `USING`; each write requires
`M(U, row.GroupId) AND G = row.GroupId`. Application role and item-grant
checks remain authoritative.

| Table | Normal row policy | Required exception or write rule |
| --- | --- | --- |
| `Groups` | `SELECT`: `M(U, Id)` and either `G = Id` or `sonivo.multi_group_user_id = U` | Authenticated slug resolution requires `M(U, Id)` and the current slug or a `GroupSlugHistory` row to match the exact `sonivo.member_group_slug`; the handler repeats the membership check before returning it. Public branding permits a Group whose current slug or exact selected historical slug resolves to it through `GroupSlugHistory`; only the public DTO is exposed. Handle login permits only the current Group slug equal to `sonivo.handle_group_slug`. Invitation acceptance permits only the Group referenced by the token-hash-selected invitation; slug allocation and an Owner's one-time slug change permit the exact candidate `Slug = sonivo.group_slug_lookup`; bootstrap insert permits only `Id = sonivo.bootstrap_group_id` with `U`; signed billing read/update permits only `Id = sonivo.payment_webhook_group_id`. Billing field changes remain constrained by the handler; RLS supplies row scope only. |
| `Memberships` | `SELECT`: `UserId = U` for the pre-check of the caller's own membership, or `M(U, GroupId)` plus `G = GroupId` / explicit multi-Group selector for rows about other members; policy must not query `Memberships` directly | Handle login permits one row with exact Group slug and normalized handle. Bootstrap insert permits only `UserId = U`, `GroupId = bootstrap id`, `Role = Owner`. Invitation lookup/update is limited by token hash; new membership binds to `U` and the invitation Group. Normal writes require `G` and `M(U, GroupId)`; the database also enforces non-null `GroupRoleId` belongs to the same `GroupId` through the composite FK `(GroupId, GroupRoleId) → GroupRoles(GroupId, Id)`. Role deletion clears assignments through a Group-scoped update before deleting the role; do not restore a single-column `ON DELETE SET NULL` FK. Managed roster deletion has one exact cross-Group exception: after Owner authorization in `G` and confirmation that `ManagedByGroupId = G`, it sets `sonivo.managed_account_group_id = G` and `sonivo.managed_account_user_id = target`, then runs a membership-only `EXISTS` check for `UserId = target AND GroupId <> G`. The policy must also require `M(U, G)` and `sonivo.group_id = sonivo.managed_account_group_id`; it may expose only those target Membership rows to that bounded query. It must not enable Group rows, roster details, or the general `IGroupStore.ListForUserAsync` projection. The selector is transaction-local and must be tested for rollback and connection reuse. |
| `GroupSlugHistory` | `SELECT`: `M(U, GroupId)` with selected Group or explicit multi-Group selector | Slug allocation/change sees only a row whose `Slug` equals the exact candidate selector. Public branding has an anonymous exception limited to `Slug = sonivo.public_group_slug`. Authenticated slug resolution requires both `M(U, GroupId)` and exact `Slug = sonivo.member_group_slug`; the handler repeats the membership check before returning the resolved Group. Normal writes require selected Group. |
| `GroupBranding` | `M(U, GroupId)` and optional Group narrowing | Anonymous reads require the exact public slug to resolve to the same Group; writes require selected Group. The handler's public DTO remains the field-level exposure boundary. |
| `GroupRoles` | `M(U, GroupId)` and optional Group narrowing | Mutations require selected Group; Owner-only role management remains application authorization. Membership role assignments must reference a role whose `GroupId` matches the Membership row. |
| `Invitations` | `M(U, GroupId)` and optional Group narrowing | Pre-membership lookup/update may access only the invitation matching `sonivo.invitation_token_hash`; acceptance binds the authenticated user to that invitation's Group. |
| `GroupAuditLog` | `SELECT` requires `M(U, GroupId)` and optional Group narrowing | Append-only grant is `SELECT, INSERT`; inserts require selected Group, `ActorUserId = U`, and current membership. Do not require `TargetUserId` membership: a member-removal audit may target a membership that was just deleted. `LeaveGroupHandler` must insert/save the actor's audit before deleting that actor's Membership, within the same request transaction. Runtime role has no `UPDATE` or `DELETE`. |
| `ResourceGrants` | `M(U, GroupId)` and optional Group narrowing | Writes require selected Group. RLS confines the grant row to its Group; it does not decide hierarchy or capabilities. |
| `Songs`, `Arrangements`, `Tasks`, `Setlists` | `M(U, GroupId)` and optional Group narrowing | All normal writes require selected Group; application-level domain checks remain in force. |
| `SetlistItems` | `M(U, GroupId)` and a parent `Setlist` with `Id = SetlistId` and `GroupId = row.GroupId` | All writes require selected Group and the same parent check. The arrangement reference is already protected by the composite `(GroupId, ArrangementId)` FK and must remain so. |
| `EventSetlistItems` | `M(U, GroupId)` and a parent `Event` with `Id = EventId` and `GroupId = row.GroupId` | All writes require selected Group and the same parent check. The arrangement reference is already protected by the composite `(GroupId, ArrangementId)` FK and must remain so. |
| `Events` | `M(U, GroupId)` and either selected Group or explicit multi-Group selector | Before a PracticeRoom hub call verifies Group membership, `EfEventGroupResolver` may read only `Id = sonivo.member_event_id` with `M(U, GroupId)`. `ConductorRoomAuthorizer` installs the exact event selector first; `GroupAccessService` then checks membership and sets verified Group scope before permission checks. Normal writes require selected Group; non-null `SourceSetlistId` must resolve to a Setlist in the same Group. The current single-column provenance FK has `ON DELETE SET NULL`; Phase 3.3 explicitly excludes Setlist hard-delete, and no delete route is currently exposed. Referential actions bypass RLS, so the policy review must include same-Group provenance integrity and migration preflight for any existing cross-Group references before any delete path is added or used. |
| `Resources` | Resolve parent `Arrangement` by `Resource.ArrangementId`, then apply the normal policy to `Arrangement.GroupId` | Every read/write inherits its parent Group; blob access remains behind existing permission and hierarchy checks. |
| `Rsvps` | Resolve parent `Event` by `EventId`, then require `M(U, Event.GroupId)` and selected Group or explicit multi-Group scope | `INSERT` requires `UserId = U` and selected `G = Event.GroupId`; `UPDATE` requires those same conditions in both `USING` and `WITH CHECK` so only the caller's RSVP can be changed. No `DELETE` permission is granted. Participant role/action checks remain in the handler. The row has no `GroupId`, so the policy must derive scope through `Events`. |
| `Notifications` | `SELECT/UPDATE`: `UserId = U`; `GroupId` is metadata and does not grant Group access | Account inserts bind to the authenticated recipient and have null Group. Group inserts require `G = GroupId`, `ActorUserId = U`, and membership for both actor and recipient in that Group, using the membership helper. Task assignment validates recipient membership before writing its notification. The Group inbox API independently requires current membership before listing/counting. Invitation creation no longer writes a notification for a pre-member: that row had no invitation reference and no usable inbox path; the invitation link remains the notification mechanism. Runtime grants remain `SELECT, INSERT, UPDATE`. |
| `AccountAudit` | Read only rows with `TargetUserId = U`; `ActorUserId = U` alone grants no read visibility | Append-only insert requires `ActorUserId = U` or `TargetUserId = U`; when `GroupId` is non-null, also require `M(U, GroupId)` and `G = GroupId`. Password-reset and verified external-login callbacks install the verified target user's bounded user scope before writing ungrouped account rows. Runtime role has no `UPDATE` or `DELETE`. |
| Identity tables, `DataProtectionKeys`, `WebhookEvents` | Global/platform rows, no Group policy | Preserve reviewed table grants. `WebhookEvents` is `SELECT, INSERT` only and is written atomically with the verified billing operation. |
| `__EFMigrationsHistory` | Migration-owned, no runtime policy | `sonivo_app` receives no table privileges. |

Every selector is conjunctive with the row identity rather than a broad
bypass: invitation hash selects one invitation; public and handle slugs select
one Group; handle value selects one Membership; slug uniqueness during
creation/change selects one candidate; bootstrap selects one server-generated Group; webhook context
selects one signature-verified Group. PostgreSQL tests must prove that changing
a route id, entity id, payload user id, or selector value cannot reach a second
row. The event lookup selector is `sonivo.member_event_id` and must be
conjunctive with `M(U, GroupId)`. Bootstrap membership, invitation acceptance, and billing changes must
also be tested after transaction rollback.

Several tenant-owned child relations use single-column FKs even though the
child also carries a Group id: Membership → GroupRole,
EventSetlistItem → Event, and Event → SourceSetlist. Their RLS policies must
correlate the parent id and require the parent's Group to equal the child row's
Group. Existing application handlers perform their own Group checks; the row
policy should preserve parent scope when a query or write omits one. The
SetlistItem parent and Arrangement references, and the EventSetlistItem
Arrangement reference, now use composite Group-scoped FKs.

`SetlistItem → Setlist` previously had `ON DELETE CASCADE` over the `SetlistId`
column alone. Because FK actions bypass RLS, a malformed cross-Group
`SetlistItem` reference could let a Group-scoped delete of its Setlist cascade-
delete a row owned by another Group. ADR-0088 supersedes ADR-0022's exact FK set
and adds `(GroupId, SetlistId) → Setlists(GroupId, Id)`, retaining the cascade
only after the database proves same-Group ownership. Migration
`EnforceSetlistItemParentGroupScope` preflights current rows and fails before
schema changes if any mismatch exists. The closed Phase 3.3 slice still has no
Setlist hard-delete route, and no route or RLS policy is added by this schema
fix.

The `Rsvps` relationship is a single-column FK to `Events.Id`; it has no
denormalized Group key or composite `(GroupId, EventId)` constraint. Its policy
must correlate the parent Event and apply that Event's Group membership/scope.
The `(EventId, UserId)` unique constraint is global per Event, so it cannot
replace the parent Event predicate or the authenticated-user write check.

### Unique and foreign-key side-channel review

PostgreSQL unique and referential-integrity checks do not follow RLS visibility
the way ordinary row reads do. Constrain the candidate row with `WITH CHECK`
before relying on a uniqueness or FK failure, and keep application responses
generic where the rejected value is sensitive.

| Constraint | Scope and source behavior | RLS/error handling consequence |
| --- | --- | --- |
| `Groups.Slug`, `GroupSlugHistory.Slug` | Globally unique slugs are the public Group namespace; public branding resolves current or historical slugs to intentionally public DTO fields. Creation probes one server-generated candidate at a time; an Owner slug change checks one validated candidate after membership and role authorization. | Slug availability is intentionally observable; a conflict must not return private Group fields. Exact slug selectors still bound lookup to one candidate. |
| `Invitations.TokenHash` | Globally unique hash of a single-use high-entropy invitation token; acceptance locates one row using the exact hashed token. | Never expose token hashes or raw database constraint errors. Keep lookup/update tied to the exact hash selector and acceptance result generic. |
| `Memberships(UserId, GroupId)` | Unique relation for one user and Group; invitation acceptance binds it to the authenticated user and invitation Group. | Bootstrap/acceptance write checks must bind `UserId = U` and the exact Group. Handle duplicate membership through existing idempotent/domain behavior without exposing another account's data. |
| `Memberships(GroupId, Handle)` | Unique handle within a Group; handle administration and login use a Group and exact handle selector. | Keep conflicts scoped to the verified Group; public handle login keeps its generic credential response and rate limit. |
| `GroupRoles(GroupId, Name)` | Unique role name within a Group; role creation is Owner-only and scoped to one Group. | Group selector and membership must pass before checking or inserting names; response may indicate an in-Group name conflict. |
| `ResourceGrants(GroupId, UserId, ResourceType, ResourceId)` | Unique grant tuple within a Group; grant operations resolve the referenced hierarchy in that Group. | Require selected Group and same-Group member/resource validation before insert. The unique tuple does not replace hierarchical authorization. |
| `Rsvps(EventId, UserId)` | Unique RSVP for one user and Event; RSVP routes require participant authorization, and `Rsvps` inherits Group through its Event. | Row policies must bind both the parent Event Group and `UserId = U` on writes before relying on duplicate handling. |
| Identity unique indexes | Platform-wide normalized username/email constraints, outside Group RLS. | Preserve existing Identity normalization, rate limiting, and enumeration-safe response behavior; tenant policies do not cover these tables. |

The Group-child FK review and this constraint inventory are source/model review,
not a substitute for PostgreSQL adversarial tests. T-4.2.05 must exercise
constraint behavior with the constrained runtime role after policy migration.

This matrix maps the current 29-table catalog to context setters and operation
families. The T-4.2.01 source gate is complete after checking each exception's
concrete EF query, relationship/FK behavior, and helper ownership/grants against
source and the test plan. T-4.2.04 remains gated on T-4.2.02/03; T-4.2.05
provides enforcement and adversarial proof under the constrained runtime role.

## Live PostgreSQL catalog reconciliation

**Checked:** 2026-10-17 against the local PostgreSQL 16.6 database on the
repository's configured host port 5433. The migrated catalog contains these
28 application/platform tables plus the EF migration-history table:

`AccountAudit`, `Arrangements`, `AspNetRoleClaims`, `AspNetRoles`,
`AspNetUserClaims`, `AspNetUserLogins`, `AspNetUserRoles`, `AspNetUserTokens`,
`AspNetUsers`, `DataProtectionKeys`, `EventSetlistItems`, `Events`,
`GroupAuditLog`, `GroupBranding`, `GroupRoles`, `GroupSlugHistory`, `Groups`,
`Invitations`, `Memberships`, `Notifications`, `ResourceGrants`, `Resources`,
`Rsvps`, `SetlistItems`, `Setlists`, `Songs`, `Tasks`, `WebhookEvents`, and
`__EFMigrationsHistory`.

The live catalog is current through migration
`20261017120000_GroupRolePermissionProfiles`. All 29 tables are owned by
`sonivo`; `sonivo` is superuser and has `BYPASSRLS`. No table has RLS enabled or
forced, and the catalog contains zero RLS policies. The runtime connection
reported `current_user = sonivo_app`; that role is not superuser, does not have
`BYPASSRLS`, `CREATEROLE`, or `CREATEDB`. This confirms local principal
separation while also confirming that local PostgreSQL currently cannot prove
policy isolation: policies are not installed, and migration/table ownership
remains privileged.

This reconciles the current table names and ownership against the local live
catalog; it does not complete the flow matrix. Runtime table grants are applied
from the reviewed post-migration allowlist in
`scripts/db/grant-runtime-privileges.sql`: the application role has no DML on
`__EFMigrationsHistory`, audit ledgers are append-only, `WebhookEvents` is
read/insert only, notifications have no delete, and Identity/Data Protection
retain the operations used by their stores. A PostgreSQL integration test
enforces these grants. In particular, public slug and handle lookup,
invitation acceptance, initial Group creation, multi-Group summaries, hubs,
report/export paths, and every Group-owned table's read/write predicates were
reviewed as part of T-4.2.01 closure. T-4.2.05 must still test these constraint
behaviors under the constrained runtime role after policy migration.

`scripts/db/verify-runtime-principal.sql` is a read-only, fail-closed check run
as the runtime login after migration and grants. It rejects superuser,
`BYPASSRLS`, role/database creation, replication, public-schema creation,
application table/sequence ownership, membership in an application object
owner, effective connection to any database except the application database,
and any privilege on `__EFMigrationsHistory`. Local setup and both CI
database jobs run it. The local PostgreSQL 16.6 check passed for `sonivo_app`
and correctly rejected the privileged `sonivo` migration principal. GitHub
hosted execution and production-principal execution remain pending.

The current `SonivoDbContext` declares **21 explicit `DbSet` properties**;
the remaining seven application tables are ASP.NET Identity tables added by
Identity's EF model, and the 29th table is `__EFMigrationsHistory`. This matches
the live catalog inventory above. A source search of direct `SonivoDbContext`
entity access from API endpoint code found three Group-table operations outside
stores: event-response CSV export inserts `GroupAuditLog` after
`GroupReportsHandler` verifies Owner access and Group scope; custom-role
deletion clears matching Group `Memberships` after `RequireOwnerAsync`; and
custom-role assignment loads one `Membership` after `RequireMemberAsync` and
its permission gate. Each query uses an explicit Group predicate. The other
direct endpoint entity accesses are Identity `UserTokens`/`UserLogins`, which
remain platform-owned.
This direct-access pass is evidence for the inventory, not a substitute for the
remaining per-store operation review and policy-enabled PostgreSQL tests.

## Access-flow inventory

| Flow | Current identity/scope | RLS design requirement |
| --- | --- | --- |
| `/api/groups/{groupId}/…` | Authenticated cookie; explicit Group route; handlers check membership | User scope first; Group selector only after membership row check; application role/action checks continue |
| `/api/groups`, upcoming activity, cross-Group calendar, `/api/auth/export` | Authenticated user; aggregates memberships across all of the caller's Groups | User-scoped policy path over only that user's memberships; the export sets `sonivo.multi_group_user_id` before Group membership traversal; no mandatory single-Group setting |
| `/api/groups/by-slug/{slug}`, authenticated tenant handoff start | Authenticated user; exact slug resolves before membership check | Short exact `sonivo.member_group_slug` selector limits current/history lookup and each candidate Group/history row must also pass the membership predicate; handler repeats the membership check and returns 404 for non-members |
| `POST /api/groups` | Authenticated user; Group id generated by server inside handler | Bounded bootstrap insert; slug existence prechecks now carry a single candidate slug |
| `PUT /api/groups/{groupId}/slug` | Authenticated Owner; one-time change after Group authorization | Keep verified Group scope for the update and history insert; set exact candidate `sonivo.group_slug_lookup` before checking current/historical slugs in other Groups |
| `POST /api/groups/{groupId}/invitations` | Authenticated Owner; issues a token-backed invitation | Group and invitation rows use the verified Group selector. Delivery is the existing best-effort email containing the join URL; no notification is written to a pre-member account. |
| `GET /api/groups/by-slug/{slug}/branding…`, `/g/{slug}/manifest…` | Public, unauthenticated current or historical slug lookup | Short transaction sets exact `sonivo.public_group_slug` for current-slug or matching `GroupSlugHistory` lookup and the resolved Group/branding metadata; blob reads occur after commit; never expose other Group data |
| `POST /api/auth/login/handle/{slug}` | Public login; resolves Group and Membership before credentials authenticate | Short transaction sets exact slug+normalized-handle selectors for the candidate lookup; generic credential response and rate limit remain |
| `POST /api/invitations/{token}/accept` | Authenticated user; invitation token resolves its Group | Transaction-local `sonivo.invitation_token_hash` now limits the pre-membership lookup; membership insertion remains bound to user plus invitation Group |
| Reports, audit, exports, resources | Authenticated user + explicit Group; existing owner/capability checks | Same tenant policy as other Group routes; preserve existing report/export and item-grant rules |
| `GroupHub.JoinGroup` | Authenticated hub invocation with Group id; calls `RequireMemberAsync` | Per-invocation transaction scope verifies membership before activation in the server-side realtime connection registry; joins recheck membership after registration, and only active authorized connections receive Group fanout (ADR-0087) |
| `PracticeRoomHub` | Authenticated; event id resolves Group and participant/conductor access | Per-invocation scope sets exact `sonivo.member_event_id`; the Event row must also pass `M(U, GroupId)`. Then the authorizer repeats membership verification and sets Group scope before permission checks. Pending room joins are excluded from recipients and membership revocation removes active participants after commit (ADR-0087). |
| `NotificationHub` | Authenticated user channel; no client-invoked server method | Notifications remain user-scoped; connection must not grant any Group scope |
| Digitize background worker | Initiating user id is retained; worker rechecks current membership and resource hierarchy access | Bounded transaction-local user scope, verified Group scope, and permission checks before resource metadata access; transaction ends before blob/transcriber work |
| Signed payment webhook and identity callbacks | No ordinary user request context | Webhook uses the provider-verified Group selector; password-reset and external-login audit use the verified target user's bounded user scope |

### Current ASP.NET route mapping

Source review of `src/Sonivo.Api/Program.cs` and endpoint extensions on
2026-10-17 found 131 literal API route mappings and two catchall fallback
mappings in `Program.cs`. The API JSON 404 fallback and production SPA fallback
are included in those two. Session-handoff routes, Google authentication
extensions, the Development-only test callback, OpenAPI, and three hubs are
cataloged separately below. This is a route-level checklist; each handler still
needs an operation-level row predicate in the policy matrix. The following
table enumerates core literal mappings; extension routes are listed after it.

| Route family | Mapped operations | Identity and transaction context | RLS treatment to design |
| --- | --- | --- | --- |
| `/api/health`, `/api/health/ready`, `/api/auth/csrf`, `/api/features`, static API fallback | Public health/config/404 | No required Identity user; readiness checks platform DB state | No Group context; readiness is platform-only |
| `/api/auth/register`, `/login`, `/login/handle/{slug}`, `/confirm-email`, `/resend-confirmation`, `/forgot-password`, `/reset-password`, `/2fa/challenge`, `/2fa/recover`, `/passkeys/login-*`, `/test/confirm` | Public account entry and test-only confirmation | Usually no authenticated user transaction; `Identity` reads/writes are global; handle login resolves Group/Membership pre-auth | Keep Identity access global; handle login gets a bounded slug/handle lookup; test hook remains disabled outside test configuration |
| `/api/auth/me`, password/logout, 2FA enrollment/status, passkey management, `/api/account/audit` | Authenticated account operations | User GUC from cookie principal; no Group selector | User-owned rows only; account audit visibility remains explicit |
| `/api/auth/export` | Authenticated own-data export across all of the user's Groups | User GUC plus explicit transaction-local multi-Group selector before membership traversal | Export only the requesting user's membership and account-audit rows; no single Group selector |
| `/api/groups`, `/api/activity/**` | User's groups and cross-Group dashboards/calendar | Authenticated user GUC plus explicit multi-Group selector before Group traversal | User-scoped membership traversal across only the user's joined Groups |
| `POST /api/groups` | Create Group and first Owner membership | Authenticated user GUC; Group id is generated inside handler | Bounded bootstrap operation for only the new Group and Owner membership |
| `/api/groups/{groupId}`, `/members`, `/roster/**`, `/tasks/**`, `/audit`, `/roles/**`, `/invitations`, `/songs/**`, `/arrangements/**`, `/resources/**`, `/setlists/**`, `/events/**`, `/calendar.ics`, `/reports/**`, `/export`, `/branding/**`, `/usage`, `/plan`, `/billing/checkout` | Group administration, collaboration, repertoire, scheduling, reports and files | Authenticated user GUC; handler verifies membership before setting Group GUC; application permission and item-grant checks remain authoritative | Group membership plus selected Group, with row ancestry for nested tables and the existing role/resource gates |
| `/api/groups/by-slug/{slug}` | Authenticated Group lookup by slug | Authenticated user; exact member slug selector before membership lookup | Current Group slug or matching history row is bounded to the exact requested slug and the RLS membership predicate; application verifies membership again before returning non-public Group data |
| `/api/groups/by-slug/{slug}/branding*`, `/g/{slug}/manifest.webmanifest` | Public branding fields and assets | Anonymous or signed-in; exact public slug GUC in a short transaction | Resolve current slug or only the matching historical-slug row, permit only public brand fields for the resolved Group, and end the metadata transaction before blob reads |
| `POST /api/invitations/{token}/accept` | Accept an invitation before membership exists | Authenticated user GUC, but no verified Group GUC at lookup time | Bounded token lookup/acceptance that can add only the authenticated user to the invitation's Group |
| `/api/groups/{groupId}/members/{targetUserId}/resource-grants` | Owner resource-grant administration | Authenticated user + verified Group | Group scope plus exact hierarchy predicates; grant table is not an RLS authorization source |
| `/api/payments/provider`, `/api/payments/webhook` | Provider metadata and signed external callback | Provider endpoint is public; webhook uses provider signature, not a user identity | Webhook event deduplication and the optional Group billing update run in one transaction. Only a Group id from the verified event sets the dedicated `sonivo.payment_webhook_group_id` selector; signature failure opens no database operation. |
| `/hubs/group`, `/hubs/practiceroom`, `/hubs/notifications` | SignalR membership, practice, and user notifications | Cookie user; a transaction is established per hub invocation by `RlsHubTransactionFilter`; no transaction spans the WebSocket | GroupHub verifies membership; PracticeRoom sets exact `sonivo.member_event_id`, resolves only an event row also covered by `M(U, GroupId)`, then verifies membership and sets Group scope; NotificationHub remains user-only |
| `POST /api/client-errors`, `POST /api/presence/heartbeat` | Client diagnostics and presence | Fallback-authenticated; user GUC present for API request | User-scoped/platform data only; do not infer Group access from diagnostics or heartbeat |

### Endpoint extension mappings and catalog exceptions

| Method | Route | Identity | Tables / scope | RLS design required |
| --- | --- | --- | --- | --- |
| POST | `/api/session/handoff/start` | Authenticated | Identity user; optional Group membership when a slug is supplied | Exact authenticated slug lookup selector first; membership check then sets verified Group; mint a single-use ticket only after that check |
| POST | `/api/session/handoff/redeem` | Anonymous | Identity user plus optional Group membership resolved from a consumed, single-use handoff ticket | The consumed ticket now starts a bounded `IGroupDataOperation` with its user id; recheck membership before signing in |
| GET | `/api/auth/providers` | Anonymous | Configuration only | No database access |
| GET | `/api/auth/google` | Anonymous | External authentication challenge | No tenant data; Identity state is global |
| GET | `/api/auth/google/callback` | Anonymous | Identity users, external logins, account audit | Global Identity/user-owned policies; no Group context |
| POST | `/api/auth/google/test-callback` | Development-only anonymous test hook | Identity users, external logins, account audit | Only mapped in Development with explicit test flag; keep disabled in production |
| GET | `/openapi/{documentName}.json` | Development/configuration-dependent | OpenAPI document only | No tenant database reads |
| FALLBACK | `/{**path}` static UI fallback | Anonymous | Static app files | Production-only `MapFallbackToFile("index.html")`; no database access |
| HUB | `/hubs/group` | Authenticated | Group membership and realtime connection registry | Per-invocation user transaction; activate only after membership recheck; outbound recipients come from the authorized registry (ADR-0087) |
| HUB | `/hubs/practiceroom` | Authenticated | Event, membership, participant/conductor permissions | Per-invocation user transaction; set exact `sonivo.member_event_id` and require `M(U, GroupId)` for the pre-membership Event lookup, then set verified Group scope |
| HUB | `/hubs/notifications` | Authenticated | User-owned notifications | User scope only; connection must not select a Group |

Sensitive pre-membership transitions now have bounded transaction selectors.
Invitation acceptance sets the hash of its unguessable token before resolving
the Group; handoff redemption consumes a one-time ticket and opens an operation
for the ticket's user before it revalidates membership. Handle login sets the
exact slug and normalized handle while resolving the candidate membership.
Authenticated `/by-slug` and tenant handoff-start lookups select one exact
current or historical slug, then verify the caller's Membership before
returning or minting a ticket.
PracticeRoom hub calls set one exact event-id selector before resolving the
event's Group; the RLS predicate also requires that the caller is a member of
that event's Group. The hub authorizer then repeats membership verification and
installs the verified Group selector before applying role capabilities.
Public branding uses an exact slug while reading only the public DTO/asset
metadata, and performs blob reads after the metadata transaction commits.
Group creation and authorized slug changes set an exact slug-existence selector
for each precheck; creation then sets the generated Group id for the bootstrap
insert. RLS predicates and
negative-path tests for these selectors remain a T-4.2.04 gate; none grants
broad public Group reads.

### Background execution review

`DigitizeJobQueue` is the only hosted `BackgroundService` currently registered.
It is bounded and keeps job state in memory. The job records the initiating
user id; the runner opens a transaction-local user scope, rechecks membership,
`resource.digitize`, and hierarchy grants, and reads only current arrangement
and resource metadata. It commits that bounded database operation before blob
access or transcription. Revoked access fails before the blob store is read.
There is no scheduled database worker in the current source. Payment webhooks
are HTTP callbacks, verified by provider signature and recorded in the
platform-owned `WebhookEvents` table. The event ledger check, optional billing
Group lookup/update, and event insert run in one transaction. A Group selector
is set only from the provider's verified normalized event, in a dedicated
payment-webhook context separate from authenticated membership scope, and a
concurrent duplicate that loses the unique event-id insert rolls its Group
update back with the transaction.

The global fallback policy means routes without a local `.RequireAuthorization()`
are still authenticated unless they have `.AllowAnonymous()`. The RLS request
middleware skips endpoints marked `.AllowAnonymous()` even when a cookie is
present. Each anonymous Group-data path then owns a short `IGroupDataOperation`
and sets only its purpose-limited selector; public branding blob reads occur
after their metadata transaction commits. Other anonymous auth endpoints use
platform Identity access without Group context.

## Source review

1. PostgreSQL documents that RLS policies constrain row visibility and writes;
   with RLS enabled and no applicable policy, the behavior is default deny.
   Policies use `USING` for visible/target rows and `WITH CHECK` for inserted
   or updated rows. Table owners normally bypass RLS unless `FORCE ROW LEVEL
   SECURITY` is enabled; superusers and `BYPASSRLS` roles always bypass. Refer to
   [PostgreSQL 16 row security](https://www.postgresql.org/docs/16/ddl-rowsecurity.html).
2. PostgreSQL documents that `SET LOCAL` lasts only for the current transaction
   and has no effect outside a transaction block. `set_config(..., true)` is
   the corresponding transaction-local function form; a missing setting can
   be read as null. Refer to [PostgreSQL 16 SET](https://www.postgresql.org/docs/16/sql-set.html)
   and [configuration functions](https://www.postgresql.org/docs/16/functions-admin.html).
3. PostgreSQL role attributes confirm that `BYPASSRLS` bypasses every row
   security policy. Refer to [PostgreSQL 16 CREATE ROLE](https://www.postgresql.org/docs/16/sql-createrole.html).
4. Npgsql resets pooled connections by default to prevent state from leaking
   between users of a physical connection. `No Reset On Close` skips that
   safety behavior and is unsuitable for tenant context. Refer to [Npgsql
   performance and connection pooling](https://www.npgsql.org/doc/performance.html)
   and [connection string parameters](https://www.npgsql.org/doc/connection-string-parameters).
5. EF Core transaction behavior means implicit `SaveChanges` transactions do
   not guarantee that an earlier tenant query ran inside the same transaction.
   Explicit transactions and execution strategies must be designed together.
   Refer to [EF Core transactions](https://learn.microsoft.com/en-us/ef/core/saving/transactions)
   and [EF Core interceptors](https://learn.microsoft.com/en-us/ef/core/logging-events-diagnostics/interceptors).
6. Microsoft describes RLS as one shared-table multitenancy isolation option,
   while noting that identity and tenant context still need to reach data
   access and that the added complexity leads many systems to use other
   patterns. Refer to [Azure multitenant storage approaches](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/storage-data).
7. OWASP's multitenant guidance calls for complete tenant-policy coverage,
   constrained runtime roles, and negative-path tests; it distinguishes an
   RLS layer from application authorization. OWASP authorization guidance also
   recommends deny-by-default and permission validation on each request. Refer
   to the [OWASP Multi Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
   and [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
8. ASP.NET Core SignalR hub filters run around each hub method invocation and
   are the supported seam for per-invocation scope; an HTTP transaction must not
   be held for a WebSocket's lifetime. Refer to Microsoft's [SignalR hub filter
   guidance](https://learn.microsoft.com/en-us/aspnet/core/signalr/hub-filters?view=aspnetcore-10.0).
9. PostgreSQL runs `SECURITY DEFINER` functions as their owner and warns that
   unsafe `search_path` values can let callers substitute objects. It also
   grants function execution to `PUBLIC` by default; selective grants should
   revoke that default in the same transaction as function creation. Any helper
   used to avoid recursive membership-policy checks must follow these rules,
   use fully qualified relations, have a narrowly scoped owner, and grant
   `EXECUTE` only to the runtime role. See PostgreSQL's [`CREATE FUNCTION`
   security guidance](https://www.postgresql.org/docs/16/sql-createfunction.html)
   and [default function privileges](https://www.postgresql.org/docs/16/ddl-priv.html).

## Design implications

- Database scope must be transaction-local and established before any
  Group-owned query. A pooled connection must not retain user or Group context.
- A verified Group selector plus a user identity may scope a normal request,
  but the policy must also check membership. A session value alone cannot grant
  access.
- Multi-Group summaries need a user-scoped policy path; requiring one Group
  setting for every query would break `/api/groups` and its aggregates.
- Anonymous brand and invitation flows, group bootstrap, background workers,
  and SignalR require narrowly bounded scope. They cannot be handled by
  pretending every operation is an ordinary authenticated Group request.
- Tenant tables without a direct `GroupId` need explicit ancestry policies.
  `Resources` must inherit its boundary through `Arrangements`.
- A policy on `Memberships` must not recursively query the same RLS-protected
  table to verify membership. Decide and test a bounded mechanism (for example,
  a narrowly scoped helper function with the PostgreSQL security requirements
  above) before writing policies. Treat helper ownership and `EXECUTE` grants as
  part of the least-privilege review.
- Foreign-key, unique-key, and constraint checks can expose information through
  behavior even when row policies hide rows. These cases need database-backed
  adversarial tests and careful error handling.
- CI that connects as a migration owner or superuser cannot prove RLS. Tests
  must run API requests under the same constrained role as the deployed app.

## Decision boundary

Adopt RLS only as a second boundary against accidental cross-Group row access.
Keep Group authorization, custom roles, and item-level hierarchy checks in the
application. Do not enable policy migrations until Phase 4.2 proves role
separation, transaction coverage, all public and realtime paths, complete table
coverage, and negative-path behavior on real PostgreSQL.
## ASP.NET endpoint inventory

Extracted from literal endpoint mappings in `src/Sonivo.Api/Program.cs` on 2026-10-17. This is a route-level checklist; handler authorization and the RLS predicate remain subject to operation review. Identity classification follows endpoint metadata: `[AllowAnonymous]` means public; otherwise the application fallback policy requires authentication.

| Method | Route | Identity | Source |
| --- | --- | --- | --- |
| GET | `/api/health` | Anonymous | `Program.cs:529` |
| GET | `/api/health/ready` | Anonymous | `Program.cs:535` |
| GET | `/api/auth/csrf` | Anonymous | `Program.cs:548` |
| POST | `/api/client-errors` | Fallback-authenticated | `Program.cs:559` |
| POST | `/api/auth/register` | Anonymous | `Program.cs:588` |
| POST | `/api/auth/login` | Anonymous | `Program.cs:652` |
| POST | `/api/auth/login/handle/{slug}` | Anonymous | `Program.cs:758` |
| GET | `/api/auth/me` | Fallback-authenticated | `Program.cs:843` |
| PATCH | `/api/auth/me` | Fallback-authenticated | `Program.cs:863` |
| POST | `/api/auth/change-password` | Fallback-authenticated | `Program.cs:897` |
| POST | `/api/auth/logout` | Fallback-authenticated | `Program.cs:959` |
| POST | `/api/auth/confirm-email` | Anonymous | `Program.cs:969` |
| POST | `/api/auth/resend-confirmation` | Anonymous | `Program.cs:1010` |
| POST | `/api/auth/forgot-password` | Anonymous | `Program.cs:1039` |
| POST | `/api/auth/reset-password` | Anonymous | `Program.cs:1067` |
| GET | `/api/auth/2fa/status` | Fallback-authenticated | `Program.cs:1161` |
| POST | `/api/auth/2fa/enroll-start` | Fallback-authenticated | `Program.cs:1180` |
| POST | `/api/auth/2fa/enroll-verify` | Fallback-authenticated | `Program.cs:1218` |
| POST | `/api/auth/2fa/disable` | Fallback-authenticated | `Program.cs:1258` |
| POST | `/api/auth/2fa/challenge` | Anonymous | `Program.cs:1313` |
| POST | `/api/auth/2fa/recover` | Anonymous | `Program.cs:1357` |
| POST | `/api/auth/2fa/recovery-codes/regenerate` | Fallback-authenticated | `Program.cs:1400` |
| GET | `/api/auth/passkeys` | Fallback-authenticated | `Program.cs:1458` |
| POST | `/api/auth/passkeys/register-start` | Fallback-authenticated | `Program.cs:1499` |
| POST | `/api/auth/passkeys/register-finish` | Fallback-authenticated | `Program.cs:1524` |
| DELETE | `/api/auth/passkeys/{id}` | Fallback-authenticated | `Program.cs:1616` |
| POST | `/api/auth/passkeys/login-start` | Anonymous | `Program.cs:1662` |
| POST | `/api/auth/passkeys/login-finish` | Anonymous | `Program.cs:1674` |
| POST | `/api/auth/test/confirm` | Anonymous | `Program.cs:1773` |
| GET | `/api/groups` | Fallback-authenticated | `Program.cs:1808` |
| GET | `/api/activity/upcoming` | Fallback-authenticated | `Program.cs:1827` |
| GET | `/api/activity/calendar` | Fallback-authenticated | `Program.cs:1846` |
| POST | `/api/groups` | Fallback-authenticated | `Program.cs:1899` |
| GET | `/api/groups/{groupId:guid}` | Fallback-authenticated | `Program.cs:1921` |
| GET | `/api/groups/by-slug/{slug}` | Fallback-authenticated | `Program.cs:1940` |
| PUT | `/api/groups/{groupId:guid}/slug` | Fallback-authenticated | `Program.cs:1959` |
| GET | `/api/groups/{groupId:guid}/branding` | Fallback-authenticated | `Program.cs:1990` |
| GET | `/api/plans` | Fallback-authenticated | `Program.cs:2016` |
| GET | `/api/groups/{groupId:guid}/usage` | Fallback-authenticated | `Program.cs:2021` |
| GET | `/api/groups/{groupId:guid}/reports/repertoire` | Fallback-authenticated | `Program.cs:2040` |
| GET | `/api/groups/{groupId:guid}/reports/event-responses` | Fallback-authenticated | `Program.cs:2058` |
| GET | `/api/groups/{groupId:guid}/reports/event-responses.csv` | Fallback-authenticated | `Program.cs:2088` |
| PUT | `/api/groups/{groupId:guid}/plan` | Fallback-authenticated | `Program.cs:2146` |
| GET | `/api/payments/provider` | Fallback-authenticated | `Program.cs:2170` |
| POST | `/api/payments/webhook` | Anonymous | `Program.cs:2182` |
| POST | `/api/groups/{groupId:guid}/billing/checkout` | Fallback-authenticated | `Program.cs:2207` |
| PUT | `/api/groups/{groupId:guid}/branding` | Fallback-authenticated | `Program.cs:2252` |
| POST | `/api/groups/{groupId:guid}/branding/logo` | Fallback-authenticated | `Program.cs:2304` |
| GET | `/api/groups/{groupId:guid}/branding/logo` | Fallback-authenticated | `Program.cs:2356` |
| POST | `/api/groups/{groupId:guid}/branding/banner` | Fallback-authenticated | `Program.cs:2383` |
| GET | `/api/groups/{groupId:guid}/branding/banner` | Fallback-authenticated | `Program.cs:2435` |
| POST | `/api/groups/{groupId:guid}/branding/favicon` | Fallback-authenticated | `Program.cs:2462` |
| GET | `/api/groups/{groupId:guid}/branding/favicon` | Fallback-authenticated | `Program.cs:2514` |
| GET | `/api/groups/by-slug/{slug}/branding` | Anonymous | `Program.cs:2542` |
| GET | `/api/groups/by-slug/{slug}/branding/logo` | Anonymous | `Program.cs:2558` |
| GET | `/api/groups/by-slug/{slug}/branding/banner` | Anonymous | `Program.cs:2581` |
| GET | `/g/{slug}/manifest.webmanifest` | Anonymous | `Program.cs:2603` |
| PATCH | `/api/groups/{groupId:guid}` | Fallback-authenticated | `Program.cs:2648` |
| DELETE | `/api/groups/{groupId:guid}` | Fallback-authenticated | `Program.cs:2675` |
| GET | `/api/groups/{groupId:guid}/members` | Fallback-authenticated | `Program.cs:2701` |
| POST | `/api/presence/heartbeat` | Fallback-authenticated | `Program.cs:2735` |
| GET | `/api/groups/{groupId:guid}/tasks` | Fallback-authenticated | `Program.cs:2754` |
| POST | `/api/groups/{groupId:guid}/tasks` | Fallback-authenticated | `Program.cs:2773` |
| PATCH | `/api/groups/{groupId:guid}/tasks/{taskId:guid}` | Fallback-authenticated | `Program.cs:2815` |
| POST | `/api/groups/{groupId:guid}/tasks/{taskId:guid}/status` | Fallback-authenticated | `Program.cs:2838` |
| DELETE | `/api/groups/{groupId:guid}/tasks/{taskId:guid}` | Fallback-authenticated | `Program.cs:2861` |
| GET | `/api/groups/{groupId:guid}/roster` | Fallback-authenticated | `Program.cs:2898` |
| POST | `/api/groups/{groupId:guid}/roster` | Fallback-authenticated | `Program.cs:2939` |
| POST | `/api/groups/{groupId:guid}/roster/import` | Fallback-authenticated | `Program.cs:3060` |
| POST | `/api/groups/{groupId:guid}/roster/{memberId:guid}/reset-access` | Fallback-authenticated | `Program.cs:3184` |
| DELETE | `/api/groups/{groupId:guid}/roster/{memberId:guid}` | Fallback-authenticated | `Program.cs:3271` |
| GET | `/api/groups/{groupId:guid}/export` | Fallback-authenticated | `Program.cs:3371` |
| GET | `/api/auth/export` | Fallback-authenticated | `Program.cs:3394` |
| DELETE | `/api/groups/{groupId:guid}/members/{targetUserId:guid}` | Fallback-authenticated | `Program.cs:3427` |
| POST | `/api/groups/{groupId:guid}/members/{targetUserId:guid}/role` | Fallback-authenticated | `Program.cs:3452` |
| PUT | `/api/groups/{groupId:guid}/members/{targetUserId:guid}/musical-role` | Fallback-authenticated | `Program.cs:3497` |
| PUT | `/api/groups/{groupId:guid}/members/{targetUserId:guid}/description` | Fallback-authenticated | `Program.cs:3521` |
| GET | `/api/groups/{groupId:guid}/audit` | Fallback-authenticated | `Program.cs:3545` |
| GET | `/api/account/audit` | Fallback-authenticated | `Program.cs:3586` |
| GET | `/api/groups/{groupId:guid}/roles` | Fallback-authenticated | `Program.cs:3647` |
| POST | `/api/groups/{groupId:guid}/roles` | Fallback-authenticated | `Program.cs:3680` |
| PATCH | `/api/groups/{groupId:guid}/roles/{roleId:guid}` | Fallback-authenticated | `Program.cs:3750` |
| DELETE | `/api/groups/{groupId:guid}/roles/{roleId:guid}` | Fallback-authenticated | `Program.cs:3836` |
| PUT | `/api/groups/{groupId:guid}/members/{targetUserId:guid}/group-role` | Fallback-authenticated | `Program.cs:3891` |
| GET | `/api/notifications` | Fallback-authenticated | `Program.cs:3980` |
| POST | `/api/notifications/{notificationId:guid}/read` | Fallback-authenticated | `Program.cs:4028` |
| POST | `/api/notifications/read-all` | Fallback-authenticated | `Program.cs:4055` |
| POST | `/api/groups/{groupId:guid}/leave` | Fallback-authenticated | `Program.cs:4084` |
| POST | `/api/groups/{groupId:guid}/invitations` | Fallback-authenticated | `Program.cs:4106` |
| GET | `/api/groups/{groupId:guid}/invitations` | Fallback-authenticated | `Program.cs:4139` |
| DELETE | `/api/groups/{groupId:guid}/invitations/{invitationId:guid}` | Fallback-authenticated | `Program.cs:4166` |
| POST | `/api/invitations/{token}/accept` | Fallback-authenticated | `Program.cs:4196` |
| GET | `/api/groups/{groupId:guid}/songs` | Fallback-authenticated | `Program.cs:4229` |
| POST | `/api/groups/{groupId:guid}/songs` | Fallback-authenticated | `Program.cs:4248` |
| GET | `/api/groups/{groupId:guid}/songs/{songId:guid}` | Fallback-authenticated | `Program.cs:4278` |
| PATCH | `/api/groups/{groupId:guid}/songs/{songId:guid}` | Fallback-authenticated | `Program.cs:4298` |
| DELETE | `/api/groups/{groupId:guid}/songs/{songId:guid}` | Fallback-authenticated | `Program.cs:4331` |
| GET | `/api/groups/{groupId:guid}/songs/{songId:guid}/arrangements` | Fallback-authenticated | `Program.cs:4359` |
| POST | `/api/groups/{groupId:guid}/songs/{songId:guid}/arrangements` | Fallback-authenticated | `Program.cs:4379` |
| GET | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}` | Fallback-authenticated | `Program.cs:4415` |
| PATCH | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}` | Fallback-authenticated | `Program.cs:4435` |
| POST | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/lyrics/import-lrc` | Fallback-authenticated | `Program.cs:4472` |
| GET | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/lyrics/export.lrc` | Fallback-authenticated | `Program.cs:4559` |
| GET | `/api/features` | Anonymous | `Program.cs:4598` |
| DELETE | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}` | Fallback-authenticated | `Program.cs:4609` |
| GET | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources` | Fallback-authenticated | `Program.cs:4637` |
| GET | `/api/groups/{groupId:guid}/resources` | Fallback-authenticated | `Program.cs:4657` |
| POST | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources` | Fallback-authenticated | `Program.cs:4676` |
| GET | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}` | Fallback-authenticated | `Program.cs:4767` |
| GET | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}/content` | Fallback-authenticated | `Program.cs:4788` |
| PATCH | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}` | Fallback-authenticated | `Program.cs:4819` |
| DELETE | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/resources/{resourceId:guid}` | Fallback-authenticated | `Program.cs:4852` |
| POST | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/digitize` | Fallback-authenticated | `Program.cs:4876` |
| GET | `/api/groups/{groupId:guid}/arrangements/{arrangementId:guid}/digitize/{jobId:guid}` | Fallback-authenticated | `Program.cs:4915` |
| GET | `/api/groups/{groupId:guid}/setlists` | Fallback-authenticated | `Program.cs:4947` |
| POST | `/api/groups/{groupId:guid}/setlists` | Fallback-authenticated | `Program.cs:4966` |
| GET | `/api/groups/{groupId:guid}/setlists/{setlistId:guid}` | Fallback-authenticated | `Program.cs:4989` |
| PATCH | `/api/groups/{groupId:guid}/setlists/{setlistId:guid}` | Fallback-authenticated | `Program.cs:5009` |
| PUT | `/api/groups/{groupId:guid}/setlists/{setlistId:guid}/items` | Fallback-authenticated | `Program.cs:5038` |
| GET | `/api/groups/{groupId:guid}/events` | Fallback-authenticated | `Program.cs:5071` |
| POST | `/api/groups/{groupId:guid}/events` | Fallback-authenticated | `Program.cs:5090` |
| GET | `/api/groups/{groupId:guid}/events/{eventId:guid}` | Fallback-authenticated | `Program.cs:5118` |
| PATCH | `/api/groups/{groupId:guid}/events/{eventId:guid}` | Fallback-authenticated | `Program.cs:5138` |
| POST | `/api/groups/{groupId:guid}/events/{eventId:guid}/cancel` | Fallback-authenticated | `Program.cs:5169` |
| POST | `/api/groups/{groupId:guid}/events/{eventId:guid}/duplicate` | Fallback-authenticated | `Program.cs:5193` |
| POST | `/api/groups/{groupId:guid}/events/{eventId:guid}/apply-setlist` | Fallback-authenticated | `Program.cs:5217` |
| PUT | `/api/groups/{groupId:guid}/events/{eventId:guid}/rsvp` | Fallback-authenticated | `Program.cs:5247` |
| GET | `/api/groups/{groupId:guid}/events/{eventId:guid}/rsvps` | Fallback-authenticated | `Program.cs:5276` |
| GET | `/api/groups/{groupId:guid}/calendar.ics` | Fallback-authenticated | `Program.cs:5306` |
| FALLBACK | `/api/{**path}` | Anonymous | `Program.cs:5346` |
| FALLBACK | `/{**path}` | Anonymous | `Program.cs:5350` |
| GET | `/api/groups/{groupId:guid}/members/{targetUserId:guid}/resource-grants` | Fallback-authenticated | `Program.cs:5356` |
| PUT | `/api/groups/{groupId:guid}/members/{targetUserId:guid}/resource-grants` | Fallback-authenticated | `Program.cs:5397` |
| HUB | `/hubs/practiceroom` | Authenticated | `Program.cs:1784` |
| HUB | `/hubs/group` | Authenticated | `Program.cs:1785` |
| HUB | `/hubs/notifications` | Authenticated | `Program.cs:1786` |

Fresh source reconciliation found 131 literal API mappings in `Program.cs` plus
the Production-only JSON 404 fallback and SPA `index.html` fallback; all 133
mappings now have route inventory rows with current source lines. Endpoint-
extension routes and the three hubs remain separately cataloged above. This
closes route-list reconciliation. Together with the direct DbContext and store
passes below and the exception matrix above, it completes the T-4.2.01 source
gate. Events expose
cancellation/soft-hide through the Phase 3.6 POST route; Event hard-delete is
explicitly outside the closed spec and has no API route. Public branding assets
and manifest, handle login, invitation token acceptance, Group bootstrap,
multi-Group dashboards, account export/audit, file access, and each hub
invocation remain priority source paths.

Direct API `SonivoDbContext` access was rechecked after the route reconciliation.
The remaining tenant-table call sites are: report-export audit insertion after
the report handler authorizes the caller; custom-role deletion clearing only
Membership rows with the selected `(GroupId, GroupRoleId)` after Owner access;
and role assignment loading one target Membership with `(GroupId, UserId)`
after membership and capability checks. These call sites rely on the verified
request Group selector as well as explicit Group predicates. No ambient Group
filter is used.

The store pass confirms the normal query boundaries: Song, Arrangement, Event,
Setlist, Task, role, invitation, audit, branding, and grant lookups carry an
explicit Group key; Resource lookups derive Group through Arrangement; and
Group report queries filter the requested Group before aggregating. The
cross-Group activity queries start from the current user's Membership and need
the explicit multi-Group selector. RSVP subqueries bind to the selected Events
and current user; Group response reports additionally count only current
members' responses. Notification reads and updates are recipient-owned, with
Group inbox membership checked in the application. Invitation pre-membership
lookup is token-hash-bound, account audit reads are target-owned, and webhook
idempotency is global platform data. The accepted Phase 4.2 spec records
T-4.2.01 complete after this exception review, the 133-row route reconciliation,
the direct DbContext/store inspection, and the operation-to-table predicate
matrix. PostgreSQL constraint behavior and policy enforcement still require the
gated T-4.2.05 tests; this source inventory does not authorize early policy
rollout.

### Referential integrity and GroupRole assignments

PostgreSQL's row-security policies do not apply to referential-integrity checks;
foreign-key checks and related uniqueness checks bypass RLS. Therefore the
Membership-to-GroupRole relationship must encode Group equality in the key
itself, rather than depend only on the API assignment check or a policy
subquery. The accepted schema uses a composite FK from `(Memberships.GroupId,
Memberships.GroupRoleId)` to `(GroupRoles.GroupId, GroupRoles.Id)`. The migration
first rejects pre-existing cross-Group references, then replaces the old
single-column FK. GroupRole deletion clears assignments with an update scoped to
the authorized Group, preserving the ability to audit and constrain that update
when RLS policies are later enabled.

Sources: [PostgreSQL 16 row security](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
and [PostgreSQL 16 constraints](https://www.postgresql.org/docs/16/ddl-constraints.html).

The same review identified a different relationship that needs an explicit
policy and migration decision: `Events.SourceSetlistId` references `Setlists.Id`
with single-column `ON DELETE SET NULL`. The application apply path verifies
the Setlist through the Event's Group, and the closed Phase 3.3 contract excludes
hard-delete. Still, a corrupt cross-Group reference would let a Setlist delete
trigger a null update to an Event in another Group, outside that Event's RLS
policy. Before exposing deletion or enabling policies, verify there are no such
rows and preserve same-Group integrity for the provenance reference. The API
reference list now marks the deletion route as unimplemented per the closed
spec.
