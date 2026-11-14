# Stripe billing runbook

**Status (2026-11-14):** T-BILL-08 lifecycle code and additive migrations are implemented. They have been applied only to isolated local PostgreSQL databases. No staging/production migration or live charge was performed. Production purge, retention and replay remain disabled until backup restoration, object deletion and database access gates are verified.

On 2026-11-05, the connected Stripe account was `New business sandbox` (test mode). Its plan products are now `Sonivo Dúo`, `Sonivo Banda`, and `Sonivo Estudio`; each has its approved monthly price as the default. Annual prices and both extra-Group prices are inactive, and the extra-Group product is inactive. One existing test-mode Banda trial remains scheduled to cancel at period end. Live account access was not available in the Stripe connection; live settings remain disabled.

## Current product contract

Visible monthly plans are Dúo ($99 MXN), Banda ($199 MXN), and Estudio ($499 MXN). The catalog maps these to Starter, Pro, and Studio. The 14-day Banda trial has the same limits and features as paid Banda, excludes Estudio, requires no card, and does not convert or charge automatically. Annual prices and discounts are undecided. Annual and extra-Group prices are inactive in the connected sandbox.

At effective trial or subscription expiry, the accepted policy is 90 days of read-only/export access, then permanent deletion of the expired Organization's Groups and files. The API projects expired billing state to read-only and permits authorized exports. The lifecycle worker enforces the 90-day deadline, accounts for active temporary grants, and purges Group data and files through durable tombstones. A tombstone remains pending until database deletion commits; replay skips pending tombstones while the Group still exists, preventing a rolled-back purge from deleting data. Committed tombstones replay after database restore. Groups support archive, 30-day Trash, restore and confirmed manual purge. The one-time legacy cleanup sends a five-day notice after successful delivery; an active Banda trial or paid coverage exempts that Group. These paths are implemented, but production expiry and purge stay disabled until backup restore/replay and object-store deletion are verified. The local UI shows the retention deadline and how to export or reactivate.

## Configuration

The dedicated `New business sandbox` catalog was created on 2026-11-04. `appsettings.json` contains three non-secret monthly Price IDs and a restricted Portal configuration. It does not contain annual or add-on Price IDs. The API project supports local .NET user secrets; put `Payments:Stripe:ApiKey` and `Payments:Stripe:WebhookSecret` there. A restricted `rk_test_*` key is accepted if it has the needed Customer, Price, Subscription, Checkout, Portal and invoice-preview permissions. Never paste either secret into tracked files or chat. A local webhook secret requires a Stripe CLI listener forwarding to `http://127.0.0.1:5171/api/payments/webhook`; a deployed sandbox requires a reachable HTTPS endpoint. Restart the API after changing secrets.

Local setup from this worktree:

```powershell
stripe login
stripe whoami --format json
stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,charge.refunded,charge.dispute.created,radar.early_fraud_warning.created --forward-to http://127.0.0.1:5171/api/payments/webhook
```

Use the listener's `whsec_*` for `Payments:Stripe:WebhookSecret`. Use the sandbox's restricted `rk_test_*` for `Payments:Stripe:ApiKey`. Store both via `dotnet user-secrets set --project src/Sonivo.Api/Sonivo.Api.csproj` in a private terminal; do not paste secret values into chat or a tracked file. Confirm `stripe whoami` reports test authentication and the intended sandbox before starting the listener. The listener's secret changes when its session changes.

The local configuration currently selects `Payments:Provider=stripe` and `Payments:Stripe:Environment=sandbox`. It contains three non-secret monthly Price IDs. API credentials remain in user secrets. `AllowLiveCharges`, `FiscalReady`, and `FinancialRlsReady` remain false. Keep them false until the live activation gates below pass. Never switch back to manual assignment after Stripe subscriptions or financial records exist.

Configure `Payments:Stripe:Environment=sandbox`, `ApiKey=rk_test_*`, `WebhookSecret=whsec_*`, `PublicOrigin` as an HTTPS origin, and the three monthly `Prices` already listed in `appsettings.json`. The API rejects unrestricted `sk_*` keys. Each Stripe Price must be active, MXN, recurring monthly, and match the configured amount. Configure `PortalConfigurationId=bpc_*`; its Stripe configuration must disable subscription updates and cancellations. Billing commands validate the configuration before use. Checkout return URLs are generated on the server.

**Tax gate:** Tax-inclusive Prices do not prove that tax is being calculated or remitted. Before live charging, validate Mexican tax obligations, product tax classification, customer address collection and any required active registrations. This integration does not enable Stripe Tax; do not treat `FiscalReady` or inclusive Prices as tax approval.

Monthly catalog amounts are MXN 99/199/499. No annual amount, discount, or add-on is approved. Price tax behavior does not establish tax calculation, remittance, or invoice compliance. Fiscal readiness, legal text, tax obligations, and invoice delivery need operator sign-off before live activation.

Set the Stripe webhook destination to `/api/payments/webhook`. Pin its event API version to the version used by Stripe.net 53.1.0. Subscribe to Checkout session completion/expiry, customer subscription create/update/delete, invoice paid/payment_failed, refund, dispute and early fraud warning events. Preserve raw request body and `Stripe-Signature` at the proxy. The endpoint returns success only after signature verification and durable inbox insertion; the worker reconciles from Stripe's current subscription state. Monitor `BillingInbox` rows with `ProcessedAt IS NULL`, `Attempts >= 10`, or `ErrorCode IS NOT NULL`. Review refund/dispute audit records; no automatic refund is issued.

## Migration and rollback

Do not apply migrations to a persistent database until a backup has been restored and verified. The lifecycle migrations add archive/Trash deadlines and the legacy notice ledger. Existing soft-deleted Groups receive a new 30-day recovery window when the lifecycle migration runs; no rows are deleted by this backfill. The legacy cleanup starts only for Groups created before the configured cutoff, after successful notice delivery, and exempts active Banda trials and paid coverage. Production purge flags default false. `EnforceSingleGroupOwnerAndOwnershipTransfer` keeps the earliest Owner by `CreatedAt`, then `Id`, demotes other Owners to Member, maps Manager to Admin, and creates the transfer table. It writes audit records and intentionally has no rollback because rollback would restore multiple Owners. Review actual Group/Owner counts on a restored copy first. Never merge subscriptions, trials, or billing Organizations automatically. Apply `scripts/db/grant-runtime-privileges.sql` only with the migration role after the migration and Phase 4.2 gates pass.

To disable new financial commands, keep the Stripe provider selected and set `Payments:Stripe:AllowLiveCharges=false` for live. Do not switch to the manual provider while subscriptions exist: its assignment endpoint would bypass paid-plan control. Preserve webhook receipt and reconciliation. Do not run the migration Down once financial operations, trials, inbox events or customer links exist.

## Live activation gate

Live remains closed until the operator supplies live Prices, live webhook secret, live Portal configuration, dedicated fiscal readiness approval, verified financial RLS, and explicit activation. `Environment=live` alone is insufficient: `AllowLiveCharges=true`, `FiscalReady=true`, and `FinancialRlsReady=true` are all required. Set `FinancialRlsReady` only after the constrained runtime principal, reviewed financial-table policies, and negative cross-Group database tests pass on the production schema. Existing sandbox billing rows are not silently promoted to live; plan migration and customer transition need a separate approved procedure.

## Test evidence and limits

Use isolated PostgreSQL databases and the payment provider's test environment. The local lifecycle run covers Owner-only archive/restore/Trash/purge, cancellation confirmation, replay after database deletion, blob cleanup ordering, retention deadlines, canonical object-key checks, and Group operation locking. The full .NET and Playwright results are recorded in `.scratch/NOW.md`. The full browser run had two failures that passed on individual rerun; investigate them before treating the full suite as green. Local checks do not prove backup restoration or a real payment. Stripe sandbox Checkout and the runtime-principal verifier remain release gates. Mobile clients show plan state only. Native iOS build requires macOS.
