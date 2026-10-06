# NOW - agent focus

**Updated:** 2026-10-06

## Checkpoint state

```text
Implementation: IN PROGRESS - Plans & personalization (ADR-0071/0072/0073)
  Branch: feature/plans-entitlements (from develop)
  PR: #231 (open, not merged)
  Delivered so far:
    - Fase A backend: PlanCatalog (single source of truth), Group.PlanId
      (migration AddGroupPlan), GroupDto planId+capabilities, branding PUT
      plan-gated (BrandingGating), GET /api/plans, API tests.
    - Fase A frontend: consume planId+capabilities; disable controls per
      capability; save echoes saved values for forbidden fields; lock card.
    - Fase B backend: ThemeId/Intensity/GradientStyle fields
      (migration AddBrandThemeIntensityGradient) + gating.
    - Fase D backend: GET /api/groups/{id}/usage (usage vs limits) + tests.
  In flight (subagent): Fase B frontend (10 themes, intensity, gradient
    style, token derivation + editor pickers).
  Remaining: Fase B frontend audit/merge, Fase C (editor by level polish),
    Fase D frontend (usage meters UI + limit notices), downgrade rules,
    and Fase E billing (provider pending - needs a decision, spec §9.13).
Human approval: APPROVED (owner: "Haz todo ... no pares hasta terminar")
Git checkpoint: COMMITTED on branch (PR #231 open)
Remote: PUSHED (branch)
CI: PR #231 checks to verify before merge
```

### Verified
- Backend: Domain 176, Application 215, API 248, Integration 58 - green.
- Frontend (`web/apps/app`): `next build` exit 0.
- Migrations: AddGroupPlan, AddBrandThemeIntensityGradient (not applied to prod).

### Notes
- Active frontend is `web/apps/app/src` (Next shell, ADR-0067); `web/sonivo-web` is legacy.
- Default plan is `studio` so existing groups keep full capabilities until billing.
- Unrelated untracked files remain: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-26df6f5/.
