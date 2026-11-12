# Stripe billing delivery

**Status:** ACCEPTED, 2026-11-03; product amendments ADR-0113/0114 (2026-11-05) and ADR-0116 (2026-11-06). **Implementation baseline:** `bdc766e`, `feature/stripe-billing`.

**Operational amendment:** ADR-0114 (2026-11-05) requires a recipient-owned active paid subscription with capacity before Group ownership transfer. The Group billing link moves atomically; the former payer's subscription stays separate and remains account-manageable. For the one-time launch cleanup, notify existing Groups without paid coverage or an active Banda trial; start five days after successful notice delivery. Active Banda trial exempts the Group. Permanent cleanup stays disabled until verified backup restore and file deletion.

**Group creation amendment:** ADR-0117 (2026-11-12) requires a valid paid entitlement, active Banda trial, or active internal access grant before creating a Group in Stripe billing mode; the existing seven-day payment grace remains valid entitlement. Users without one may still join existing Groups. Start the no-card, no-auto-charge Banda trial from Account Membership before creating the first Group. A Billing Organization may have no PrimaryGroupId until the first Group is created; assign it atomically with Group creation. Server checks remain authoritative.

## Contract

Billing Organization owns billing and quotas, never tenancy. Group remains the authorization boundary. Membership and permissions are required for every Group operation; payment grants no Group access. New subscriptions cover eligible Groups; existing paid subscriptions, trials and legacy grants never merge automatically. Use Stripe Billing and hosted Checkout for new subscriptions. Per ADR-0116, add or replace subscription cards in Sonivo with Stripe Payment Element and a server-created SetupIntent; do not send users to Customer Portal for this action. Accept only server-configured monthly Prices and return origins. Annual billing and extra-Group add-ons are unavailable pending product decisions. No manual paid-plan mutation in Stripe mode. Separate trial eligibility, subscription state, Group-bound legacy access, operation idempotency, webhook inbox and financial audit records.

Visible plan names: Dúo/Banda/Estudio in Spanish, Duo/Band/Studio in English, and Duo/Banda/Estúdio in Portuguese. Internal mapping: Starter/Pro/Studio. Monthly prices: MXN 99/199/499. No permanent free plan, annual price, discount, or automatic trial conversion. Trial is Banda/Pro only, 14 days, no card required, and one per billing owner. It uses the same features and quotas as paid Banda/Pro. Studio/Studio is excluded. Current enforced group/member/storage limits remain hypotheses pending validation; do not present them as proven product requirements.

At the effective end of a trial/subscription, after any already documented failed-payment grace, preserve Groups, memberships, permissions, content, and files as read-only/export-only for 90 days. New access and product writes stop; security/privacy actions and authorized export remain available. A subscription before the deadline restores editing within plan quotas. At the deadline, permanently purge the expired Organization's Groups and associated data/files, without deleting user accounts or unrelated Groups/Organizations. Purge must be idempotent, retryable, and replayed after backup restore. Financial records stay separate pending approved retention policy. No legal deletion promise until legal and backup behavior are verified.

Groups are Active, Archived, Trash, or Billing Read-only; these states do not imply each other. Archived and Trash Groups count toward quota. Trash lasts 30 days; then purge Group data and blobs. Only the sole Owner can archive, restore, move to Trash, or permanently delete. Manual permanent deletion requires explicit confirmation. Restore requires available quota. Downgrade never deletes or archives Groups: over-quota Groups remain visible and read-only until the Owner resolves capacity. Each Group has one Owner. Transfer requires the Owner's explicit request and recipient acceptance; completion atomically promotes the recipient and changes the prior Owner to Member. Existing multiple Owners migrate by keeping the earliest membership (`CreatedAt`, then `Id`) and demoting the rest to Member. Manager maps to Admin only with the same existing non-Owner permission set. Billing Organization membership never grants Group membership.

On accepting a transfer, the recipient must own an active paid subscription with free Group capacity; trial eligibility for transfer remains open. Move only the Group's BillingGroup link. Keep the previous Billing Organization and subscription with the former payer, who can manage it through account-scoped billing routes. The one-time launch cleanup is separate from ordinary 90-day expiry and 30-day Trash policies.

## Tickets and acceptance

1. **BILL-01:** accepted decisions, tool provenance, catalog and domain lifecycle tests.
2. **BILL-02:** additive persistence/backfill, unique constraints, authorization and RLS coverage.
3. **BILL-03:** Stripe adapter, checkout/portal, operation idempotency and manual-assignment closure.
4. **BILL-04:** durable signed webhook inbox, concurrent duplicate handling, worker/reconciliation and expiry.
5. **BILL-05:** shared Studio membership/capacity, storage enforcement, trial and change flows.
6. **BILL-06:** existing web plans/membership UI, localized states, native read compatibility.
7. **BILL-07:** PostgreSQL/API/Playwright and external sandbox proof, operational runbook and review.
8. **BILL-08:** final plan/trial contract, single Owner/Admin role migration and subscription-qualified transfer, Group archive/trash/restore/purge, five-day unbilled legacy launch cleanup, 90-day Organization read-only/export/purge, file deletion, and backup-replay design. Production purge stays disabled until backup restore and tombstone replay are proven.

Use TDD at approved domain/Application/API/PostgreSQL/browser boundaries. Each ticket requires exact validation results. Never claim unavailable external sandbox tests passed. New subscriptions require explicit consent; return URLs do not activate plans. Refund/dispute events produce review records, never automatic refunds. Credentials and fiscal certificates never enter git. Do not run data-changing migrations against persistent environments without a verified backup and restore procedure. Do not bypass Phase 4.2 RLS gates.

## Rollout

Sandbox-first. Production is disabled by configuration and cannot be enabled without fiscal readiness and explicit activation. Do not apply a production migration. Deactivation stops new billing commands while preserving webhook receipt/reconciliation. No destructive rollback of financial records. No automatic commit/push/PR/merge.
