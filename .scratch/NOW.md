# NOW - agent focus

**Updated:** 2026-10-06

## Checkpoint state

```text
Implementation: IN PROGRESS - Group design refactor (ADR-0074)
  develop includes:
    - PR #230 (ADR renumber), PR #231 (plans/personalization A-E), PR #232 (theme v2).
  Theme v2 (merged): group shell derives neutrals (canvas/surface/border/sidebar/hover)
    from the accent (tint 5-13% by intensity); dark is accent-derived, not fixed navy;
    AA ink clamps vs the actual tinted surface. Account/panel keep Sonivo's fixed identity.
  Next (ADR-0074):
    1) Shared GROUP components (web/apps/app/src/groups/ui/) consumed by all group pages.
    2) Modal-based creation (song/setlist/event/task/resource).
    3) Personalized selects.
    4) Extend real-time to the new components.
  Plans follow-ups: 80%/100% limit notices on create screens; Organization model (ADR-0072);
    payment gateway (ADR-0073, manual today).
Human approval: APPROVED (owner: "Haz todo ... no pares hasta terminar")
Git checkpoint: COMMITTED + MERGED (#230, #231, #232)
Remote: PUSHED
CI: PASSING (PR #232 green: Backend, Frontend, SCA, CodeQL, Analyze, Playwright)
```

### Notes
- Active frontend is `web/apps/app/src` (Next shell, ADR-0067); `web/sonivo-web` is legacy.
- Default plan is `studio`; Starter = 5 members (owner-confirmed).
- Untracked ajenos: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-*.
