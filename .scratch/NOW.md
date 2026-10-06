# NOW - agent focus

**Updated:** 2026-10-06

## Checkpoint state

```text
Implementation: COMPLETE (slices 1-2) + payments abstraction (slice 3)
  Merged:
    - PR #233 feature/group-ui-refactor -> develop (ADR-0074: groups/ui kit, creation
      modals, custom GroupSelect, real-time bus, all group pages migrated).
    - PR #234 feature/plan-limit-notices -> develop (80%/100% limit notices + ?tab=plan).
  In this branch (feature/payments-abstraction), merge pending:
    - ADR-0075: provider-agnostic IPaymentProvider + Manual provider (default) +
      HMAC-signed Sandbox provider; ProcessPaymentWebhookHandler with signature
      verification + idempotency (WebhookEvents ledger, new migration); owner-only
      checkout endpoint; single CSRF exemption scoped to the signed webhook path.
    - Tests: Application 4, Integration 8, Api 3 (new); full suite green locally
      (Domain 181, App 222, Integration 66, Api 251).
Human approval: APPROVED
Git checkpoint: PENDING (payments branch)
Remote: NOT PUSHED (payments branch)
CI: NOT RUN (payments branch)
```

### Remaining (not started)
- Organization model (ADR-0072) — large: new entity + migration + backfill + group-limit
  validation against the org, and moving plan/billing to the org in Studio. Needs its own
  focused, verified delivery.
- Commercial payment provider + CFDI/tax (ADR-0075 leaves these OPEN; Sandbox ships now).

### Notes
- Active frontend is `web/apps/app/src` (Next shell, ADR-0067).
- Unrelated untracked files remain: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-*.
