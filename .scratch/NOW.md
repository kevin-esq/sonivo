# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-GATE-B-03)
Human approval: PENDING
Git checkpoint: COMMITTED (local; push/PR in progress)
Remote: NOT PUSHED
CI: NOT RUN
```

**Live:** https://sonivo.onrender.com  
**main:** do not merge until Gate B accepted (`61de8bb`)

## Proof

- T-GATE-B-01 PR #22 + nav order #23
- T-GATE-B-02 PR #24 merged (`e87887a`); CI Playwright 15/15
- T-GATE-B-03: setlist list/detail chrome + Spanish Playwright helpers

## Next

Human review of T-GATE-B-03 PR. Then T-GATE-B-04 Events.

## Firewall

- Do **not** implement T-3.2.06 / Google OAuth / Event notes
- Do **not** commit OAuth secrets
- Do **not** start Google billing / Render paid
- Do **not** merge `main`
