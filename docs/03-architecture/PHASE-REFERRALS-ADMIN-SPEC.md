# Referral rewards, temporary access, and accounting administration

**Status:** Accepted product decisions; operational contract amended by [ADR-0118](DECISIONS.md). The administration API remains disabled pending isolation gates.

## Goal

Allow Billing Organization owners to share a referral code, award the referrer 30 free days after the referred Organization's first successful paid invoice, let internal Sonivo administrators grant a time-limited plan, and deliver reliable accounting facts to the system of administration.

## Binding boundaries

- The payment provider remains the only payment and recurring-renewal authority. Sonivo decides entitlements and referral rewards. The system of administration records accounting only.
- `BillingOrganization` owns subscription, referral attribution, rewards, and temporary plan grants. It is not an authorization tenant. `Group` remains the tenant and all Group operations still check membership and permissions.
- A payment-success return URL, client-side state, email address, or accounting record cannot activate an entitlement or qualify a referral.
- No card data, payment-provider secret, or system-of-administration credential may reach the browser or mobile clients.
- Do not send marketing/referral email. Referral sharing uses an in-app link/code unless a future decision authorizes transactional email.
- No payment collection, renewal, access grant, or subscription mutation may originate in the system of administration.

## Referral contract

1. Each eligible Billing Organization owner can retrieve a stable referral code and copy a signup link at `/auth/register?referral={code}`. The web client preserves the untrusted code through registration and login, then pre-fills it in Membership for explicit submission. The API remains authoritative and validates attribution before the first paid invoice; opening the link alone never attributes an account.
2. One referral attribution may be recorded for a referred Billing Organization before its first paid invoice. Check Stripe's paid-invoice history as well as Sonivo's ledger so delayed webhooks cannot permit late attribution. The referrer and referee are resolved to stable internal Organization IDs; never identify either by email alone.
3. Reject self-referral and any attempt to replace existing attribution. A referred Organization can qualify only once, regardless of Groups or subscription retries.
4. Only a signed, processed Stripe `invoice.paid` event for that Organization's first positive-amount subscription invoice qualifies. Trial invoices and zero-amount invoices do not qualify. The invoice ID and event ID provide independent deduplication keys.
5. Award exactly 30 days to the referrer's next recurring renewal. Do not award the referred customer a discount or cash reward.
   - Cap the referrer's accumulated, unconsumed rewards at 360 days (12 × 30-day rewards). Keep excess rewards pending until outstanding free time falls below the cap. Process eligible pending rewards FIFO by creation time and stable ID; pending rewards do not expire.
6. Move renewal only for an active paid Stripe subscription, after safely preserving its current state. When no Subscription Schedule is attached, set `trial_end` to the later of the paid period end or existing trial end, plus 30 days, with `proration_behavior=none`; verify the Stripe readback before marking applied. An attached Schedule, pending cancellation, trialing subscription, or missing eligible active renewal stays pending. Do not create an immediate invoice or prorate. See Stripe's [subscription update API](https://docs.stripe.com/api/subscriptions/update).
7. Repeated Stripe delivery, worker retries, or an out-of-order event must not award the same invoice twice or qualify a later invoice ahead of Stripe's earliest positive paid subscription invoice. A schedule update must use a stable idempotency key and be reconciled from Stripe before marking the reward applied.
8. Refund/dispute events create review records. Never issue an automatic refund. Reversal of an unused referral reward remains an open decision.

## Temporary plan access

- The signed and scoped administration API in ADR-0118 can grant or revoke access. Each grant uses a catalog plan, reason, expiry within 90 days, and idempotency operation ID; audit records include service and asserted human-operator IDs.
- A grant applies to the Billing Organization's entitlements only. It does not create a Stripe customer/subscription, charge, invoice, referral, Group membership, or Group role.
- During an active grant, use the granted plan's existing entitlement limits. At expiry or revocation, fall back to the current Stripe-confirmed entitlement and existing downgrade/read-only behavior; preserve data.
- The API remains disabled until sandbox credentials and the PostgreSQL isolation gate are configured. It does not create a payment-provider subscription or alter billing.

## Accounting administration contract

- Sonivo persists payment and invoice facts from verified Stripe events, including stable Sonivo Organization ID, Stripe Customer/Subscription/Invoice/Payment IDs when present, amount in minor units, currency, status, covered period, UTC event time, and refund/dispute references.
- Keep payment attempts and refund/dispute events immutable and separate. Do not overwrite a failed attempt with a later success.
- A durable outbox stores stable event IDs and verified payment facts. No delivery worker or destination is enabled by this work.
- The system of administration may map invoice and payment facts to accounting records. No receiver schema, tax/fiscal behavior, endpoint, or credentials are confirmed; data remains local until a separate contract is approved.
- No amount, tax treatment, legal retention rule, accounting policy, or market limit is inferred here.

## Delivery tickets

1. **REF-01:** attribution/code domain, secure application boundary, unique constraints, and user-facing summary.
2. **REF-02:** invoice/payment event ledger, first-positive-paid-invoice qualification, idempotent reward creation, refund/dispute review.
3. **REF-03:** safe Stripe schedule extension, retry/reconciliation, no immediate charge, and pending-reward states.
4. **REF-04:** time-limited plan grants and revocation behind fail-closed internal administrator authorization and audit.
5. **REF-05:** accounting outbox persistence only; delivery remains disabled until endpoint and mapping are confirmed.
6. **REF-06:** localized referral and administrative flows, PostgreSQL/API/browser security tests, and sandbox proof.

## Open decisions and launch gates

- Platform service key provisioning, ownership, and rotation operations for each environment.
- Referral-code capture point and what happens when a new account has multiple Groups or later changes its billing owner.
- How unused rewards are handled after a refund/dispute or a permanently canceled subscription.
- System-of-administration endpoint, authentication, record mapping, tax/fiscal workflow, retention, and reconciliation ownership.
- Live referral rewards and accounting delivery remain disabled until these open decisions and the existing billing/RLS launch gates are closed.

## Verification boundaries

- Test on PostgreSQL and the existing web/API authentication path; do not count in-memory tests as RLS verification.
- Sandbox tests must prove webhook signature rejection, event/invoice dedupe, no self-referral, no zero-amount referral award, no immediate charge during the 30-day extension, idempotent retries, and restoration of the normal renewal price.
- Admin tests must prove invalid/replayed HMAC denial, time-window enforcement, scope denial, required reason/expiry, idempotency, audit, suspension precedence, and no change to Group roles or provider billing.
- Outbox tests verify local event persistence and retry state only. No remote receiver is configured or called.
- No production migration, live payment mutation, accounting transmission, or data purge is authorized by this spec.
