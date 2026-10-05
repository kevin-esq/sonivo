# NOW - agent focus

**Updated:** 2026-10-05

## Checkpoint state

```text
Implementation: COMPLETE - Next.js monorepo + product parity bridge + Vite removed
  Branch: feature/nextjs-multitenant-bff (PR #217)
  Structure (web/, Turborepo):
    apps/app    (@sonivo/app)  - the product: ported SPA mounted in Next + handoff backend
    apps/docs   (@sonivo/docs) - Fumadocs
    apps/mobile (@sonivo/mobile, placeholder)
    packages/{api-client,i18n,ui}
  Removed: web/sonivo-web (Vite). Docker/CI/E2E repointed to the Next app.
  .NET: host-only session cookie + /api/session/handoff/start|redeem (+9 tests).
Human approval: APPROVED (owner: "hazlo todo ... borra lo legacy", 2026-10-05)
Git checkpoint: COMMITTED (branch)
Remote: PUSHED (PR #217 -> develop)
CI: see PR #217 checks
```

### Verified
- `dotnet build Sonivo.slnx -c Release` PASS (0 errors, 0 warnings).
- .NET tests: Api 232 · Domain 141 · Application 211 PASS (584 total).
- `web` `turbo run build`: `@sonivo/app` PASS (and static export PASS), `@sonivo/docs` PASS.

### Notes / follow-ups
- Parity bridge landed: routes are decomposed to idiomatic App Router (W-B..W-G)
  and subdomain tenancy is restored; Next type/lint gating re-enabled afterwards.
- Playwright E2E must be validated by CI (full stack cannot run locally).
- Deferred: wildcard DNS/TLS, `GroupDomain`, backend i18n/mail.
