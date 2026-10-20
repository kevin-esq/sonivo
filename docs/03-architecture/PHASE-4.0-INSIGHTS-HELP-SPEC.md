# PHASE-4.0 — Group insights, reports, audit, and guided help

**Status:** ACCEPTED — scope authorized by the owner on 2026-10-17; decisions in
[ADR-0083](DECISIONS.md) and [ADR-0084](DECISIONS.md) bind.
**Delivery:** Ticketed, vertical slices. This phase does not reopen Phases 0–3.9.
**Commercial values:** Plan prices, trial rules, limits, and retention durations
remain provisional/open under [PHASE-PLANS-SPEC](PHASE-PLANS-SPEC.md).

## Goal

Help a group understand its current coordination state, safely review important
changes, and help new or infrequent users complete common tasks without a
mandatory tour. Prepare the plan catalog to distinguish these capabilities
without making unconfirmed commercial promises.

## Binding principles

1. Usage meters, product reports, group activity audit, and account security
   history are separate concepts and screens/contracts (ADR-0083).
2. Group IDs select scope; every API verifies membership and permission on the
   server for every request (ADR-0079). Never use PostgreSQL RLS or ambient
   tenant filters (ADR-0079/0082).
3. Existing content remains readable and manageable according to authorization
   even if a plan changes. Security/audit enforcement is never paywalled.
4. Aggregate reports are the default. Member-level data appears only when the
   report requires it and the caller has permission. Exports are permissioned
   and audited.
5. RSVP counts mean declared responses/availability, not attendance.
6. Historical charts require a trustworthy timestamped source. Current state
   must not be presented as a trend.
7. Help and onboarding remain optional, resumable, localized in es/en/pt, and
   consistent with shipped behavior (ADR-0084, WCAG 2.2 AA target).

## Initial report contracts

| Report | Measures | Exclusions |
| --- | --- | --- |
| Group overview | Current members, songs, setlists, upcoming events; plan usage remains in Settings | No historical trend unless separately backed by snapshots |
| Repertoire inventory | Songs, arrangements, and attached resources grouped by supported kind; links back to the library | No ranking of members or inferred musical quality |
| Event responses | RSVP response counts by event and response status, with event date and roster denominator where available | Does not claim attendance; no-response is not a “No” |
| Group activity | Existing attributable administrative actions from the append-only group audit | Not a complete record of ordinary content reads or all edits until coverage is implemented |

Every report API contract must declare its time zone, date range semantics,
denominator, empty-state behavior, and permission. Where source data cannot
support a requested measure, omit it and explain why.

The initial event-response view uses UTC instants and a half-open `[from, to)`
range. Its simple presets cover upcoming events in the next 30, 90, 180, or 365
days. Dates are presented in the viewer's local time. The no-response
denominator is current active Group memberships with an Identity account at
query time; roster-only people cannot RSVP and are excluded. This is not a
historical roster snapshot.

## Entitlements

Use stable catalog identifiers and typed capabilities, not UI text or inline
price comparisons. Candidate dimensions to validate in code are:

- `insights.basic`: live aggregate group overview.
- `reports.advanced`: defined report filters and breakdowns.
- `reports.export`: export of reports within the caller's scope.
- `history.group`: group activity history visibility/window.

These are capability names, not a final plan mapping. Plan assignment, prices,
retention, and which tier includes each capability remain open until validated
against the accepted plans spec and current billing implementation. Account
security history and audit write/enforcement are never represented by these
entitlements.

## Onboarding and help

- Replace the `/help` placeholder with a searchable or clearly grouped help hub
  of short guides and FAQs linked to working product destinations.
- Put a consistent Help entry in the signed-in shell.
- Offer first-run steps appropriate to the user: join/create a group; add a
  song and arrangement; invite or configure people; prepare a setlist/event.
- Users can skip, dismiss, resume, and reopen guidance. Completion is based on
  server-observed product state. Onboarding preferences are user UX state only,
  never authorization data.
- Do not teach unshipped report exports, billing checkout, group-wide RLS, or
  resource-kind overrides that are not fully enforced.

## Tickets and acceptance gates

### T-4.0.01 — Audit coverage and safe event contract

- Inventory current group/account audit actions and identify missing security-
  relevant mutations (including role profile and scoped access changes).
- Add only events with a defined actor, action, target, outcome, timestamp, and
  bounded metadata. Never store credentials, tokens, full request bodies, or
  signed URLs in audit metadata.
- Confirm append-only behavior, server authorization to read, pagination,
  filtering, injection-safe display, and group-isolation tests.
- Write a separate retention decision before expiry/deletion behavior ships.

### T-4.0.02 — Report API and domain measure definitions

- Implement the initial report contracts above using explicit Group-scoped
  queries and current data only.
- Add application/API tests for Owner/permission boundaries, cross-Group
  denial, empty groups, date ranges, and correct RSVP denominator semantics.
- Do not add snapshots, background jobs, a warehouse, third-party analytics,
  or unapproved personal tracking in this ticket.

### T-4.0.03 — Reports UI and export

- Add a simple Reports destination with understandable labels, date filters,
  loading/error/empty states, and responsive accessible tables/cards.
- Add export only after T-4.0.01 defines the audit action and T-4.0.02 defines
  stable report DTOs. Verify export is group-scoped and permission-checked by
  the API; client hiding is not security.
- The initial event response CSV uses a stable column schema, protects text
  cells from spreadsheet formula execution, and writes an audit event with
  report identity and UTC range before returning the file.

### T-4.0.04 — Plan capability cleanup

- Keep limits/features in the server plan catalog as the single source of
  truth. Update frontend DTOs/UI to consume capability identifiers.
- Do not display placeholder prices, trial claims, or checkout choices as
  available commercial offers. Display a neutral “plans being prepared” state
  until billing is actually available.
- Do not change provider/CFDI, pricing, trial, or retention decisions here.

### T-4.0.05 — First-run checklist and Help hub

- Replace the `/help` placeholder with localized, verified how-to guides and
  concise FAQs. Add persistent, consistent Help navigation.
- Show a short optional onboarding checklist from observed account/group
  state. Skip/resume/reopen work at desktop and mobile widths and with keyboard
  and screen-reader semantics.
- Keep ordinary workflows short; advanced role/report controls use progressive
  disclosure.

### T-4.0.06 — End-to-end verification and UX review

- Add real-stack Playwright journeys for a new user reaching a useful group
  task, opening Help later, viewing a report as authorized, and receiving a
  denial when unauthorized.
- Validate es/en/pt key parity, WCAG 2.2 AA-relevant semantics, keyboard use,
  mobile layout, and no placeholder plan price/checkout claims.
- Run focused .NET/API tests, PostgreSQL-backed integration tests where query
  behavior/migrations require them, frontend build/type checks, and the critical
  Playwright journeys. Report each result exactly.

## Explicitly excluded

Third-party behavioral analytics, raw user surveillance, predictive scoring,
actual attendance inference, financial/compliance reporting, automated billing
provider rollout, confirmed public prices/trials, cross-organization reports
without Organization authorization, and PostgreSQL RLS.
