# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-GATE-B-01 shell/tokens/auth)
Human approval: PENDING (auditor)
Git checkpoint: PENDING
Remote: NOT PUSHED
CI: NOT RUN
```

**Live:** https://sonivo.onrender.com  
**main:** do not merge until Gate B accepted (`61de8bb`)

## Proof

- T-GATE-B-01 implemented on `feature/t-gate-b-01-shell`
- Frontend `npm run build` passed; Playwright full suite 15 passed

## Next

Auditor review of T-GATE-B-01. Do not merge `main`. Do not start T-GATE-B-02 until this PR is accepted.

## Firewall

- Do **not** implement T-3.2.06 / Google OAuth / Event notes
- Do **not** commit OAuth secrets
- Do **not** start Google billing / Render paid
