# NOW - agent focus

**Updated:** 2026-10-04

## Checkpoint state

```text
Implementation: IN PROGRESS - Group white-label identity propagation + membership relocation
  Branch: feature/group-white-label-identity (from develop @ b4c05cb)
  Scope:
    - Semantic brand tokens: group accent now drives --color-primary / -strong / -ink /
      -foreground / secondary / accent / shell-link (light + dark, AA-clamped).
    - GroupSettingsPage hardcoded slate -> semantic tokens; group "Membresía" tab removed.
    - Account-level Membership page (/cuenta/membresia) + account sidebar entry.
    - Branding editor: draft-driven component preview using the real tokens.
    - New E2E: e2e/tests/w23-brand-identity.spec.ts.
Human approval: APPROVED (owner: "Estas autorizado a todo", 2026-10-04)
Git checkpoint: COMMITTED (a9c4263 branding, 38f58a0 account, this commit tests)
Remote: PUSH PENDING
CI: NOT RUN
```

### Verified this session (live stack: API 5171, Vite 5173, Postgres 5433)
- `npm run build` PASS · `npm run lint` PASS (0 errors, pre-existing warnings only)
- Playwright MCP screenshots: group home/songs/members/settings light + dark, mobile 390px
- Targeted E2E: w1-shell, home-dashboard, w6-light-theme, w9-surfaces, w20-branding, cuenta — PASS
- New E2E w23-brand-identity (brand token drives buttons; membership is account-level) — PASS

### Notes / follow-ups
- Console: pre-existing `/g/{slug}/manifest.webmanifest` JSON parse error (unrelated).
- Account pages (SettingsLayout / security sections) still use `dark:` + slate; a
  `@custom-variant dark` was added so those now follow `data-theme`, but they were
  not fully re-tokenized.
- Git actions (commit/push/PR/merge) require explicit authorization.
