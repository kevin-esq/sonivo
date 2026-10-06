# NOW - agent focus

**Updated:** 2026-10-06

## Checkpoint state

```text
Implementation: COMPLETE - Plans & personalization (ADR-0071/0072/0073)
  Branch: merged to develop via PR #231 (2958810); feature branch deleted
  Delivered:
    - Fase A: PlanCatalog (single source of truth), Group.PlanId
      (migration AddGroupPlan), GroupDto planId+capabilities, branding PUT
      plan-gated (BrandingGating), GET /api/plans; frontend consumes the
      capabilities, disables controls, preserves saved values for forbidden
      fields, lock + upgrade card.
    - Fase B: ThemeId/Intensity/GradientStyle (migration
      AddBrandThemeIntensityGradient); 10 themes + intensity + gradient style
      in the token engine (--brand-wash) and the editor; reset to Sonivo.
    - Fase D: GET /api/groups/{id}/usage + Plan tab (usage bars);
      PlanLimitGuard enforces songs/setlists/events-per-month on creation (403).
    - Fase E (no gateway): billing lifecycle (BillingStatus/TrialEndsAt/
      ScheduledPlanId; migration AddGroupBilling) + PUT /api/groups/{id}/plan
      (owner, manual: assign/trial/schedule/apply/read_only). Starter -> 5
      members (owner-confirmed). Payment provider deferred (owner chose
      manual/invoices).
  Tests: Domain 181, Application 218, API 251, Integration 58 - green.
  CI: PR #231 checks green (Backend, Frontend, SCA, CodeQL, Analyze, Playwright).
Human approval: APPROVED (owner: "Haz todo ... no pares hasta terminar")
Git checkpoint: COMMITTED + MERGED (PR #231)
Remote: PUSHED (branch deleted after merge)
```

### Remaining (not blocking; follow-ups)
- Limit notices (80%/100%) on the create screens (Library/Setlists/Events) -
  the server enforces; the UI notice is polish.
- Organization model (ADR-0072) - group limit + extra-group add-on validate
  against it; not yet implemented (plan is group-level today).
- Billing provider/gateway + CFDI (ADR-0073) - owner chose manual/invoices.
- OKLCH colour math (spec §5.2) - current hex/RLU math already meets AA.

### Notes
- Active frontend is `web/apps/app/src` (Next shell, ADR-0067).
- Default plan is `studio` so existing groups keep full capabilities.
- Unrelated untracked files remain: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-26df6f5/.
