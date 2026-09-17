# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: IN PROGRESS (T-GATE-B-04)
Human approval: PENDING
Git checkpoint: PENDING
Remote: NOT PUSHED
CI: NOT RUN
```

**Live:** https://sonivo.onrender.com  
**main:** do not merge until Gate B accepted (`61de8bb`)

## Proof

- T-GATE-B-01–03 merged on `develop` (through #25)
- Branch: `feature/t-gate-b-04-events`

## Next

Finish T-GATE-B-04: build + Playwright, then commit/push/PR per ticket auth.

## Firewall

- Do **not** implement T-3.2.06 / Google OAuth / Event notes/location
- Do **not** commit OAuth secrets
- Do **not** start Google billing / Render paid
- Do **not** merge `main`
