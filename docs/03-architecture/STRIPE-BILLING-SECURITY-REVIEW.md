# Stripe billing differential security review

> **Current status (2026-11-05):** The historical findings below do not establish launch readiness. The previous full Release .NET suite passed 901/901; latest focused API (2/2), Integration (2/2), and Application (1/1) checks passed. The migration is generated but unapplied. No commit, push, production migration, live charge, or full Stripe sandbox Checkout journey occurred.

## Current launch blockers

- **Critical — accepted 90-day retention remains incomplete.** Current changes project expired subscriptions to read-only and block Group-scoped mutations through central access checks and the EF write interceptor. No persisted 90-day deadline, expiry notice, Organization/Group purge worker, or backup tombstone replay exists.
- **Critical — Group lifecycle is incomplete.** `Group` only has `DeletedAt` soft deletion. Archive, Trash, restore, Owner-only permanent deletion, 30-day purge and blob cleanup are not implemented. Backup replay tombstones are absent, so a purge could be undone by restoring a backup.
- **Critical — legacy access and launch cleanup conflict.** `AddStripeBilling` still backfills an unbounded `LegacyPlanId`. The accepted five-day Owner notice, Banda-trial exception, and automatic Group/file purge are not implemented. Do not apply the migration until that workflow and its recovery gates exist.
- **High — ownership transfer now requires an active paid subscription with capacity.** The Group billing link moves atomically to the recipient's organization; the former payer's subscription remains separate and has account-scoped list/Portal routes. Focused tests pass, but live ownership/billing recovery and a full Stripe subscription journey remain unverified. Trial eligibility for transfer remains an open product decision.
- **High — PostgreSQL financial RLS is absent.** Billing tables still rely on application filtering. Keep live activation blocked until Phase 4.2 runtime-principal and negative cross-Organization tests pass.
- **High — migration not applied or rehearsed against a backup.** It demotes duplicate Owners and maps Manager to Admin. It keeps the earliest Owner by `CreatedAt`, then `Id`, writes audit rows, and does not support rollback. Rehearse on a verified restored copy before any persistent environment.
- **Medium — client contracts still use Manager.** Backend emits Admin after migration; web and native role selectors/localizers remain on the old contract. Do not roll out the database/API change before clients can read and display Admin.
- **Medium — Stripe checkout lifecycle lacks current manual browser proof.** No authenticated Checkout, successful payment, webhook reconciliation, renewal, cancellation, or expired-trial journey was submitted in this validation. The connected Stripe account is sandbox only; live flags remain false.
- **Scan status:** Codex Security deep scan did not start because its desktop worker could not obtain the required managed filesystem permission profile. No Codex Security scan report is claimed.

The Stripe sandbox catalog now uses `Sonivo Dúo`, `Sonivo Banda`, and `Sonivo Estudio`; annual and extra-Group Prices are inactive. The previous review and follow-up below are retained as dated evidence. Read them with these current blockers.

**Scope:** `bdc766e` to the uncommitted `feature/stripe-billing` worktree, 2026-11-03. High risk paths reviewed: financial HTTP entry points, Group authorization, Stripe request construction and signatures, persistent inbox, reconciliation, quota interception, migrations, runtime grants and browser redirects. No commit exists for this diff. Existing manual plan and webhook code originated in `b790afb0` and remains reachable only outside Stripe mode; the Stripe branch now rejects manual assignment.

**Assessment:** CONDITIONAL. Local compilation, unit/API/integration tests, a populated PostgreSQL backfill and one real React/API/PostgreSQL browser journey pass. Payment lifecycle is unverified against an authenticated Stripe sandbox. No live charge or production migration is authorized.

## Findings

### High: paid billing is not proven end to end yet

The connected Stripe account is `New business sandbox` in test mode. Eight MXN Prices and a restricted Portal configuration were created and verified on 2026-11-04; their non-secret IDs are configured locally. A restricted sandbox API key is now stored in local .NET User Secrets. The webhook signing secret and authenticated Stripe CLI listener remain missing. Thus Checkout, payment confirmation, upgrade, renewal, cancellation and webhook reconciliation have not been proven against Stripe. Do not enable live charges or claim BILL-07 complete. The connected plugin does not itself provide the API/webhook secrets to the running app.

### Medium: configured Price validation does not prove licensed flat-rate billing

`StripeBillingGateway.ValidatePriceAsync` previously omitted `recurring.usage_type`, `billing_scheme` and `transform_quantity`. It now requires licensed, per-unit, untransformed Prices before paid commands. A malformed-Price integration test covers the rejected cases; external Checkout proof remains pending.

### Medium: subscription state can lag a provider-side cancellation

`StripeBillingReconciliation.ReconcileAsync` fetches the known subscription, but `BillingWorker` refreshes all organizations every 15 minutes and processes webhooks asynchronously. A lost or delayed cancellation webhook can leave a locally active entitlement until the next refresh. The creation guard reads local state only. Bound the exposure with reliable webhook delivery, provider health alerts and an explicit maximum staleness policy before live activation.

### High: financial tables lack dedicated PostgreSQL row policies

`scripts/db/grant-runtime-privileges.sql` grants the runtime role read/write access to all billing organizations, links, operations, trials and inbox rows. The isolated migrated database had zero `pg_policies` on 2026-11-03; Sonivo's broader RLS deployment remains a separate gated rollout. Application endpoints check active Group membership and billing titular, but a compromised runtime SQL context could read another organization's financial records. Keep live billing disabled until the existing RLS rollout supplies reviewed financial-table policies and negative cross-Group tests. Do not claim database isolation from the API tests alone.

Live writes now also require `Payments:Stripe:FinancialRlsReady=true`, defaulting to false. Set it only after the runtime-principal, policy, and negative database-test gates pass against the production schema. This configuration gate does not replace database verification.

### Medium: Stripe lifecycle needs external contract proof

`StripeBillingService` uses Checkout, invoice preview, pending subscription update, subscription schedules and restricted Portal configurations. The official SDK compiles and local signature checks pass, but no test account is connected. Stripe can reject a parameter combination or return a lifecycle state that local fixtures do not expose. Sandbox test Prices, webhook version, Portal configuration and all BILL-07 journeys are a release gate. Production flags remain false.

### Medium: provider call and local transaction are not atomic

Checkout and subscription changes call Stripe while `MutateAsync` holds a PostgreSQL transaction. If Stripe accepts a command but the database commit fails, local operation records can roll back. Stable Stripe idempotency keys reduce duplicate effects for retries; reconciliation later imports authoritative subscription state. A long outage beyond Stripe's idempotency retention still needs operator review of Stripe events and `BillingOperations` before retrying a paid change. The UI shows a generic failure and asks the owner to inspect status; it does not silently retry.

### Low: risk events without a customer require manual correlation

`charge.dispute.created` and `radar.early_fraud_warning.created` can omit a direct customer in their event object. Such signed events stay in `BillingInbox` and retry up to ten times with `ErrorCode=unmapped-customer`; they no longer disappear as processed. An operator must correlate dead-letter rows with Stripe event IDs. No automatic refund or suspension occurs.

## Controls verified

- Stripe-mode manual assignment returns 403; unrelated signed-in user receives 404 for billing read and Portal.
- Checkout without configured test credentials fails closed; forged or stale webhook signatures fail.
- Price IDs and return origins come from server configuration. Price amount, currency, tax behavior, recurrence and live/sandbox mode are checked before paid writes.
- Only environment-matched restricted `rk_*` API keys pass configuration; unrestricted `sk_*` keys fail closed. The plans UI also hides all billing writes while the provider is unavailable.
- Portal configuration must disable subscription plan changes and cancellations.
- Existing content deletion survives canceled billing; new content requires an entitlement.
- Legacy Studio access is backfilled only for an active Group with an active Owner. The migration aborts without that Owner.
- Live commands require explicit `AllowLiveCharges`, `FiscalReady`, and `FinancialRlsReady`; all default false or unset. No live keys, charges or production changes were used.

**Coverage:** 220 domain, 247 application, 314 API, 76 selected integration, one Stripe-mode E2E, Android debug assembly, Next production build and TypeScript passed. iOS and external Stripe sandbox remain untested. The broader repository RLS suite was not run against the isolated database because its production policies are not present there.

## Follow-up — 2026-11-04

The plans UI now keeps displayed prices and billing state read-only when Stripe credentials are unavailable; checkout, trials, portal, subscription changes and Group linking are hidden. The API remains authoritative and rejects writes when charging is not configured. Stripe API configuration now rejects unrestricted `sk_*` keys. Runbook clarifies that tax-inclusive Prices do not establish tax calculation or compliance.

Fresh checks: TypeScript passed; focused E2E passed (1/1); billing domain tests passed (11/11); API tests passed (1/1); focused integration tests passed (4/4 before the restricted-key test, then Stripe signature tests passed (3/3) in Release); NuGet vulnerability check found no vulnerable packages. `git diff --check` passed. Local browser showed disabled plan/period selectors, visible price, unavailable status and no payment buttons.

The Codex Security deep scan did not start because its desktop worker could not obtain the required managed filesystem permission profile. No Codex Security scan report is claimed. Financial-table RLS, real Stripe sandbox lifecycle, Mexican tax readiness, and production configuration remain release gates.
