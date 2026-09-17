# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (Phase 3.7 T-3.7.01–03)
Human approval: APPROVED (Kevin Esquivel; decision-auditor PASS)
Git checkpoint: PENDING commit on feature/phase-3.7-people
Remote: NOT PUSHED
CI: NOT RUN
```

**Live:** https://sonivo.onrender.com (`develop`)  
**main:** do not merge until Gate B (UI redesign)

## Sequence

1. Git checkpoint 3.7 → PR `develop` → CI → merge
2. **Gate A remaining:** 3.8 invite hygiene → T-OPS-01 → 3.9 SMTP (Resend)
3. **Gate B** — rediseño UI → merge `main` (do not start)

## Firewall

- Do **not** implement SMTP / T-3.2.06 / merge `main` in this checkpoint
- Do **not** start UI redesign before Gate A
