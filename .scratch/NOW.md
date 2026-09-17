# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: IN PROGRESS (Gate B T-GATE-B-01)
Human approval: AUTHORIZED (Kevin Esquivel — Gate B brief + board)
Git checkpoint: PENDING (docs contract then feature PRs)
Remote: NOT PUSHED (this slice)
CI: NOT RUN
```

**Live:** https://sonivo.onrender.com  
**main:** do not merge until Gate B accepted (`61de8bb`)

## Proof

- T-OPS-02 verified: Render GitHub App `92085443` includes `kevin-esq/sonivo`
- Gate B contract: `docs/03-architecture/PHASE-GATE-B-UI-SPEC.md` + brief + board image

## Next

Auditor: version docs PR, then delegate T-GATE-B-01 (shell/tokens/auth) to a builder. Merge `develop` only. Never `main`.

## Firewall

- Do **not** implement T-3.2.06 / Google OAuth / Event notes
- Do **not** commit OAuth secrets
- Do **not** start Google billing / Render paid
