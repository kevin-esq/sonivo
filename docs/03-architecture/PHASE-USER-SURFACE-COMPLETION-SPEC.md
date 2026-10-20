# User-visible placeholder completion

**Status:** ACCEPTED — owner-authorized 2026-10-19 to integrate all user-visible
“Coming soon” areas through UI, API, persistence, and security review.
**Implementation:** COMPLETE LOCALLY — all twelve delivery tickets below are
implemented and locally validated. The calendar integration ships as an
authenticated iCalendar download; public revocable subscription URLs remain
gated as described under T-SURFACE-03.
**Delivery:** Vertical tickets. Existing phase gates remain binding; this spec
does not authorize production configuration, external account changes, or Git
actions.

## Goal

Replace user-visible placeholders with complete, supported behavior. Reuse
existing APIs and screens where possible; add backend contracts only where the
current product has no authoritative behavior. Keep account security notices,
Group notifications, product reports, and plan usage as separate concepts.

## Inventory and current behavior

| Surface | Current behavior | Completion target |
| --- | --- | --- |
| App notification navigation and bell | Account security notifications and Group-scoped notification inbox already exist. | **COMPLETE** — App navigation and bell open the account inbox; the Group bell remains Group-scoped. |
| Account notification preferences | The account page exposed disabled email and in-app rows. | **COMPLETE** — in-app access opens the existing inbox. Email categories and delivery remain outside this scope. |
| Group notification settings | Recipient-owned in-app notices existed without configurable preferences. | **COMPLETE** — supported per-recipient preferences persist and suppress eligible Group notices on the server. |
| Integrations | The Group settings tab had no service or backend contract. | **COMPLETE LOCALLY** — authenticated members can download a read-only `.ics` export that follows Group visibility and excludes cancelled events. Public revocable subscription URLs remain behind the Phase 4.2 access-policy gate. |
| Account usage | Group usage was available from Group settings; account usage rows were disabled. | **COMPLETE** — current usage is shown per accessible Group and links to the authoritative Group settings. No limits are summed across Groups. |
| Plan and billing | Plan catalog, manual assignment, signed Sandbox provider, webhook idempotency, and Group plan usage existed; the account page was incomplete. | **COMPLETE LOCALLY** — current plan, usage and supported manual/Sandbox lifecycle are visible. Live charging and provisional prices are not presented as available. |
| Reports | Overview, repertoire inventory, RSVP responses, and Group audit reports existed; Tasks, Setlists, and Participation were unavailable. | **COMPLETE** — Group-scoped reports have explicit date and denominator semantics. RSVP is declared availability, not attendance. |
| Member activity | A profile showed some attributable administrative audit activity and promised unsupported contributions. | **COMPLETE** — supported Task and repertoire actions display only with an attributable actor and timestamp. Attendance is not inferred. |
| Sessions and access | Account and member profile pages exposed disabled session/access descriptions. | **COMPLETE** — users can inspect and revoke their own sessions; Owners can disable or restore a member in this Group only, with audit history and realtime revocation. Owner access cannot be disabled. |

The unused `settings.membershipComingSoon` locale key and the un-routed generic
placeholder are cleanup items, not new capabilities. The normal Groups page
already supplies its rename, leave, delete, and invitation handlers.

## Binding constraints

1. Group is the authorization tenant. Every Group request checks current
   membership and required capability in the API; client-supplied IDs and
   hidden controls never authorize access.
2. Account security history remains separate from Group notifications. A
   notification is recipient-owned; Group-scoped items are visible only while
   the recipient has current access to that Group.
3. Preserve Identity cookies and antiforgery. No browser JWTs, ambient tenant
   filters, broad subdomain trust, or credential storage in the client.
4. Notification preferences affect in-app delivery only. Email verification,
   reset, and any separately authorized transport contract remain unchanged.
5. The shipped calendar export requires current Group membership and exposes
   only event fields the member can read. It does not issue a public feed
   credential. Public revocable subscriptions require a separately accepted
   access-path and secret-handling design plus the applicable Phase 4.2 gates;
   do not expose a Group feed secret in HTML, analytics, or redirects.
6. Reports declare date range, timezone, denominator, inclusion rules,
   permission, and empty-state behavior. Exports remain permissioned and
   audited. No historical trend without timestamped source data.
7. Usage is derived from the existing plan catalog and server-side counters.
   Billing UI may use manual assignment or the existing signed Sandbox only;
   real payment provider, pricing, and tax decisions remain release blockers
   for live charges.
8. New tenant-owned tables and access paths enter the Phase 4.2 inventory and
   pass its gates. RLS stays disabled until its accepted rollout criteria pass.
9. All user-facing copy is localized in es/en/pt; backend identifiers,
   messages, routes, and tests remain English.

## Delivery tickets

Tickets are independent vertical slices. Each includes UI/API changes and
behavior-focused tests at the existing HTTP, application, and real-stack E2E
boundaries where applicable.

| Ticket | Deliverable | Blocked by |
| --- | --- | --- |
| T-SURFACE-01 | **COMPLETE LOCALLY** — reach the account security-notification inbox from App navigation and bell. | None |
| T-SURFACE-02 | **COMPLETE LOCALLY** — persist recipient-owned in-app preferences and enforce them during eligible Group notice creation. | T-SURFACE-01 |
| T-SURFACE-03 | **COMPLETE LOCALLY** — authenticated read-only iCalendar download. Public revocable subscription URLs remain gated by the Phase 4.2 access-policy and credential design. | None |
| T-SURFACE-04 | **COMPLETE LOCALLY** — show authoritative plan usage for each accessible Group on the account usage surface. | None |
| T-SURFACE-05 | **COMPLETE LOCALLY** — show supported manual/Sandbox plan state and checkout with clear non-live billing status. | T-SURFACE-04 |
| T-SURFACE-06 | **COMPLETE LOCALLY** — Group Tasks report with explicit status, assignee, and date semantics. | None |
| T-SURFACE-07 | **COMPLETE LOCALLY** — Group Setlist usage report using current domain references. | None |
| T-SURFACE-08 | **COMPLETE LOCALLY** — participation report using RSVP declarations and an explicit no-response denominator. | None |
| T-SURFACE-09 | **COMPLETE LOCALLY** — member activity for supported Task and repertoire actions; unsupported attendance promises removed. | T-SURFACE-06, T-SURFACE-07, T-SURFACE-08 |
| T-SURFACE-10 | **COMPLETE LOCALLY** — users inspect and revoke their own active Identity sessions. | None |
| T-SURFACE-11 | **COMPLETE LOCALLY** — Owner-managed Group access deactivation/reinstatement with audit, preserved membership history, realtime revocation, and Owner protection. | None |
| T-SURFACE-12 | **COMPLETE LOCALLY** — obsolete placeholder copy, dead component references, and stale tests removed or updated. | T-SURFACE-01–11 |

## Security and completion gates

- API tests cover anonymous, non-member, insufficient-role, foreign-Group,
  former-member, cross-user, malformed, replay, and revoked-credential cases as
  relevant to each ticket.
- Mutations require antiforgery. The calendar download uses authenticated
  Group access; no public feed credential is issued by this delivery.
- New APIs use explicit DTOs, server-side validation, safe Problem Details,
  bounded queries, rate limits for credential issuance, and audit records for
  access and security changes without storing secrets.
- Frontend checks cover keyboard operation, accessible names, responsive
  behavior, safe errors, language parity, and no stale “Coming soon” controls.
- Real-stack journeys cover Group isolation, notification preferences,
  authenticated calendar export, report permissions, billing manual/Sandbox
  state, session revocation, and Group member access revocation/restoration.
- No live payment provider or external calendar account is configured by this
  phase.
