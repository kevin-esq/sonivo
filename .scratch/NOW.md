# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-OPS-01 DataProtection keys)
Human approval: PENDING auditor
Git checkpoint: PENDING
Remote: NOT PUSHED
CI: NOT RUN
```

**Live:** https://sonivo.onrender.com (`develop` includes 3.7 PR #15, 3.8 PR #16)  
**main:** do not merge until Gate B (UI redesign)

## Sequence

1. Git checkpoint T-OPS-01 → PR `develop` → CI → merge (Render will migrate `DataProtectionKeys`)
2. **T-OPS-02:** Kevin grants Render GitHub app access to `kevin-esq/sonivo` (I cannot)
3. **Phase 3.9** SMTP / Resend (optional Gate A)
4. **Gate B** — rediseño UI → merge `main` (do not start)

## Firewall

- Do **not** implement SMTP / T-3.2.06 / merge `main` in this ops checkpoint
- Do **not** start UI redesign before Gate A
