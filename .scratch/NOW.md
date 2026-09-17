# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-3.9.04 on develop)
Human approval: APPROVED (Kevin Esquivel, merge #19)
Git checkpoint: COMMITTED / MERGED (468517c) + docs checkpoint IN PROGRESS
Remote: PUSHED
CI: PASSING (PR #19)
Live image: STALE until Manual Deploy of 468517c or T-OPS-02
```

**Live:** https://sonivo.onrender.com  
**main:** do not merge until Gate B (still `61de8bb`)

## Local proof

Playwright `e2e` chromium **15/15** (2026-09-17) against API 5171 + Vite 5173 + Postgres 5433.

## Sequence

1. Docs checkpoint PR → CI → merge `develop` → delete branch
2. Manual Deploy `468517c` (Free) so live matches Gmail sender
3. T-OPS-02 Render GitHub app — Kevin only
4. Gate B UI redesign **after** T-OPS-02 — not started

## Firewall

- Do **not** implement T-3.2.06 / merge `main` / Gate B UI
- Do **not** commit OAuth secrets
- Do **not** start Google billing / Render paid
