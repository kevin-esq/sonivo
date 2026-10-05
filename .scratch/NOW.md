# NOW - agent focus

**Updated:** 2026-10-05

## Checkpoint state

```text
Implementation: COMPLETE - Next.js web monorepo (panel + docs) + session handoff
  Branch: feature/nextjs-multitenant-bff (from develop; PR #213)
  Structure:
    web/ (Turborepo workspace)
      apps/app  (@sonivo/app)  - product shell: (saas) marketing + [tenant] workspace
      apps/docs (@sonivo/docs) - Fumadocs documentation
      sonivo-web (legacy Vite SPA, retired after parity)
  Scope:
    - ADR-0067 + PHASE-NEXTJS-MULTITENANT-BFF-SPEC.md (amends ADR-0010, unblocks
      ADR-0049, extends ADR-0043 to pt).
    - apps/app: host+locale middleware, SSR branding theme vars, i18n es/en/pt,
      AttendanceTracker client, handoff page.
    - apps/docs: Fumadocs (Next 16) at /docs.
    - .NET: host-only session cookie (Domain=null; __Host- name off Dev) +
      /api/session/handoff/start|redeem (256-bit single-use code, TTL 90s, SHA-256
      stored, UA binding, rate-limited, no CSRF exemption) + 9 unit tests.
Human approval: APPROVED (owner: monorepo web/ + Turborepo + 2 apps + Fumadocs, 2026-10-05)
Git checkpoint: COMMITTED (feature/nextjs-multitenant-bff)
Remote: PUSHED (PR #213 -> develop)
CI: see PR #213 checks
```

### Verified this session
- `dotnet build Sonivo.slnx -c Release` PASS (0 errors, 0 warnings; .NET 10).
- `dotnet test`: Api 232 PASS · Domain 141 PASS · Application 211 PASS (584 total).
- `web` `turbo run build`: `@sonivo/app` PASS (8 routes + middleware), `@sonivo/docs` PASS.

### Notes / follow-ups
- `packages/*` seeded: `@sonivo/i18n`, `@sonivo/api-client`, `@sonivo/ui` extracted from `apps/app` (build green). `@sonivo/config` still PLANNED.
- Deferred: wildcard DNS/TLS + custom domain verification (ADR-0049 D3),
  `GroupDomain` table, backend i18n/mail (ADR-0043 phase 2), page-by-page migration,
  and CI wiring for the `web/` workspace.
- In-memory handoff store is single-instance; swap behind ISessionHandoffStore
  before scaling out.
