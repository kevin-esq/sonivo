# NOW - agent focus

**Updated:** 2026-10-05

## Checkpoint state

```text
Implementation: COMPLETE - Next.js multi-tenant BFF foundation + session handoff
  Branch: feature/nextjs-multitenant-bff (from develop; PR #213)
  Scope:
    - ADR-0067 + PHASE-NEXTJS-MULTITENANT-BFF-SPEC.md (amends ADR-0010, unblocks
      ADR-0049, extends ADR-0043 to pt).
    - web/sonivo-next: Next.js App Router BFF scaffold (middleware host+locale,
      SSR branding theme vars, i18n es/en/pt, AttendanceTracker client, handoff page).
    - .NET: host-only session cookie (Domain=null; __Host- name off Dev) +
      /api/session/handoff/start|redeem (256-bit single-use code, TTL 90s, SHA-256
      stored, UA binding, rate-limited, no CSRF exemption) + 9 unit tests.
Human approval: APPROVED (owner: "un solo pr para todo el cambio", 2026-10-05)
Git checkpoint: COMMITTED (feature/nextjs-multitenant-bff)
Remote: PUSHED (PR #213 -> develop)
CI: see PR #213 checks
```

### Verified this session
- `dotnet build Sonivo.slnx -c Release` PASS (0 errors, 0 warnings; .NET 10 after PR #214).
- `dotnet test`: Api 232 PASS · Domain 141 PASS · Application 211 PASS (584 total).
  Integration tests require PostgreSQL on 5433.
- `web/sonivo-next`: `npm install` + `npm run build` PASS (Next 15.5.27; 8 routes).

### Notes / follow-ups
- Migration is strangler: `web/sonivo-web` (Vite) remains the production UI.
- Deferred: wildcard DNS/TLS + custom domain verification (ADR-0049 D3),
  `GroupDomain` table, backend i18n/mail (ADR-0043 phase 2), page-by-page migration,
  and CI wiring for `web/sonivo-next`.
- In-memory handoff store is single-instance; swap behind ISessionHandoffStore
  for a distributed store before scaling out.
