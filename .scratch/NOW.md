# NOW - agent focus

**Updated:** 2026-10-05

## Checkpoint state

```text
Implementation: COMPLETE - Groups UX refresh + plans/personalization docs
  Branch: feature/groups-ux-refresh (from develop)
  Commits:
    147aab6 feat(groups): mobile-first responsive redesign
    be66834 docs(now): record groups responsive redesign checkpoint
    63c66ce feat(branding): display typography, live preview and account menu
    (docs)  feat: plans/personalization spec + ADR-0061/0062/0063
  Scope:
    - Responsive: nav (single "Mas", 4 tabs), 44px targets, agenda <640,
      skeletons, AA tokens (light+dark).
    - Branding/UX: display typography (ADR-0060, 10 fonts), live brand preview,
      liquid-glass --brand-wash, account dropdown + safer logout, floating
      unsaved-changes bar.
    - Docs: PHASE-PLANS-SPEC.md; ADR-0061 (entitlements + gated personalization),
      ADR-0062 (organization), ADR-0063 (payments IN, supersedes ADR-0042).
Human approval: APPROVED (owner: "Autorizo todo", 2026-10-05)
Git checkpoint: COMMITTED (branch)
Remote: NOT PUSHED
CI: NOT RUN
```

### Next implementation (authorized, not started)
- Fase A: entitlements catalog (single source of truth) + effective-plan
  capability filter on brand render (spec §6/§10.1-10.3). No payments yet.
- Fase B: OKLCH derivation + intensity + gradientStyle + 10 themes + contrast guard.
- Then level-gated editor, backend plan validation, usage meters, downgrade rules.
- Billing/provider is placeholder (ADR-0063) and needs a provider decision (§9.13).

### Verified this session
- `npm run build` PASS · `npm run lint` (oxlint) exit 0.
- Overflow 0 (dark/light x 320/390/768 x 11 routes); contrast 0 (binary); focus 0 missing.
- Live preview, floating bar, account menu verified via Playwright screenshots.
- Full E2E not run locally (API lacks Auth__EnableTestHook).

### Notes / follow-ups
- Backend `GroupBranding` typography allowlist extended to 10 ids; API must be
  rebuilt/restarted for the new ids to be accepted.
- Unrelated local working-tree changes present (not from this task): `.vscode/`,
  `w-h-live-viewer.png`, `.scratch/shots/` - left untouched.

## Tooling — OpenCode V2 hardening (2026-10-05)

- User-authorized: `opencode.json` migrated to V2-native `mcp.servers`; added MCP
  `semgrep` (enabled), `snyk` (enabled; auth via `snyk_auth`) and `github` (local
  Docker; PAT via env); added project-local skills `dotnet-secure-architecture`,
  `react-frontend-security` and `git-governance` (31 -> 34).
- Added a Conventional Commits `commit-msg` hook (`.githooks/`) + `.commitlintrc.json`;
  Git actions stay human-authorized.
- Recorded in ADR-0064/0065, `docs/tooling/OPENCODE-V2-MCP-SKILLS-2026-10.md`,
  `TOOLING-AUDIT.md`, `SKILLS-INVENTORY.md`.
- Git checkpoint: COMMITTED with this change; Remote: NOT PUSHED.
