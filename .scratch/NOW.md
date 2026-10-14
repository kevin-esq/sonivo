# NOW - agent focus

**Updated:** 2026-10-14

## Checkpoint state

```text
Branch: develop (all work from the Grupos batch is merged)
Implementation: COMPLETE for the approved batch
Human approval: APPROVED
Git checkpoint: COMMITTED
Remote: PUSHED
CI: NOT RUN for this checkpoint (no open PRs)
```

## Merged into develop (this batch)

- `refactor/frontend-restructure` (#238) — i18n es/en/pt with English keys, api split,
  Spanglish sweep, group shell redesign, marketing landing, home metrics + home-only rail.
- SignalR group realtime (#237).
- Theme-flash fix + branding cache (#263).
- Managed accounts (#264) — add a member with or without a Sonivo account (invitation link or
  generated credentials, optionally emailed).
- **Custom group roles with permissions (#265)** — `GroupRole` entity + `GroupPermissions`,
  migration `AddCustomGroupRoles`, roles CRUD (Owner) + assign a role to a member.

## Deliberately NOT merged

- **boneyard-js skeletons** (PR #266, closed). The theme requirement was already met: the
  group skeletons use the group-scoped tokens (`bg-surface-hover`, `bg-surface-hover/80`),
  which the shell repaints per group in light and dark. What the branch actually added was a
  runtime dependency to swap `animate-pulse` for a shimmer, a `fixture` prop duplicating the
  hand-written placeholder, and **no captured bones** — the CLI cannot snapshot them because
  our loading state lives ~200ms and the group routes are auth-gated and not linked from the
  start route. No bones file exists; the library renders its fallback. Closed rather than
  merged: a dependency for a cosmetic animation. If polish is wanted, a shimmer is ~5 lines of
  CSS with no dependency.

## Remaining

- **Plans** (`/plan` still a placeholder) — needs product definition (pricing/gating).
- **Observability**: client error reporting is in; a global ErrorBoundary is still missing.
- **Arrangement editor** multi-track/stem lanes need a model change (one `audio` resource per
  arrangement today). Do not fake multi-track data in the UI.

## Dependency note (pre-existing, not introduced by this batch)

`npm audit` in `web/` reports 2 postcss vulnerabilities (1 moderate, 1 high) that exist on a
clean `develop` checkout. Reachable via the Vite/Tailwind toolchain, not app runtime code.
Fix separately: bump postcss.

## Notes

- Local stack: API 127.0.0.1:5171 (`Auth__EnableTestHook=true`, `ASPNETCORE_ENVIRONMENT=Development`),
  Next dev 5173, Postgres 5433. Browser must use `localhost:5173` (127.0.0.1 drops cookies).
- `npx tsc --noEmit` in `web/apps/app` reports 3 pre-existing `main.tsx` errors
  (TS5097, `.tsx` import extensions). Harmless: `npm run build` (vite) is the real gate and passes.
- Never commit: `.vscode/`, `.turbo/`, `.scratch/shots/`, `.scratch/*.mjs`, `.scratch/clyc-recon/`.
