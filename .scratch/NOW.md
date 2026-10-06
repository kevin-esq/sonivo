# NOW - agent focus

**Updated:** 2026-10-06

## Checkpoint state

```text
Implementation: COMPLETE - Groups UI refactor + plan follow-ups (notices + payments)
  Merged to develop:
    - PR #233 feature/group-ui-refactor (ADR-0074): groups/ui kit, creation modals,
      custom GroupSelect, real-time group data bus, all group pages migrated.
    - PR #234 feature/plan-limit-notices (PHASE-PLANS-SPEC §4.1): 80%/100% limit notices
      on Library/Setlists/Events + ?tab=plan deep link.
    - PR #235 feature/payments-abstraction (ADR-0075): provider-agnostic IPaymentProvider,
      Manual default + HMAC-signed Sandbox gateway, signature-verified idempotent webhooks
      (WebhookEvents migration), owner-only checkout, single signed CSRF exemption.
  Verification (all green):
    - Frontend: tsc clean (pre-existing main.tsx TS5097 only), next build green,
      Playwright E2E 88 passed / 3 skipped / 0 failed.
    - Backend: Domain 181, Application 222, Integration 66, Api 251.
    - CI: PRs #233/#234/#235 all checks pass; merged.
Human approval: APPROVED
Git checkpoint: COMMITTED + MERGED (#233, #234, #235)
Remote: PUSHED (branches deleted after merge)
CI: PASSING
```

### Remaining (not started; needs a dedicated, verified pass)
- **Organization model (ADR-0072)** — large and tenancy-critical: a new `Organization`
  entity + migration + backfill, `Group.OrganizationId`, group-limit validation against the
  organization, and moving plan/billing to the organization in Studio. Deferred rather than
  rushed because it touches billing/tenancy invariants and deserves its own delivery.
- **Commercial payment provider + CFDI/tax (ADR-0075 leaves these OPEN)** — the sandbox
  gateway and the abstraction ship now; a real adapter + Mexican invoicing are a follow-up.

### Notes
- Active frontend is `web/apps/app/src` (Next shell, ADR-0067).
- `/grupos` (GroupsPage) is account/panel chrome (ADR-0074 §2) and stays on Sonivo-fixed `ui/`.
- `reactStrictMode` is disabled in `web/apps/app/next.config.ts` (dev-only double-mount raced
  the create modals; production never double-invokes effects).
- Unrelated untracked files remain: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-*.
