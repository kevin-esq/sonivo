# NOW — agent focus

**Updated:** 2026-09-17

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-3.9.01–03 optional invite email / Resend)
Human approval: APPROVED (Kevin Esquivel; auditor PASS)
Git checkpoint: PENDING
Remote: NOT PUSHED
CI: NOT RUN
```

**Live:** https://sonivo.onrender.com  
**main:** do not merge until Gate B (UI redesign)

## Sequence

1. Branch `feature/phase-3.9-smtp` → commit → PR `--base develop` → CI → merge → delete branch
2. **T-OPS-02:** Kevin grants Render GitHub app access to `kevin-esq/sonivo` (I cannot)
3. Live Resend env (optional): `Resend__ApiKey`, `Resend__From`, `PublicOrigin=https://sonivo.onrender.com` on Render — never git
4. **Gate B** — rediseño UI → merge `main` (do not start)

## Tests run (local)

- `dotnet test Sonivo.slnx`: Domain 73, Application 119, Integration 22, Api 72 — all pass
- Playwright: **15/15** (includes TC-INV-03; no Resend key)

## Firewall

- Do **not** implement T-3.2.06 / merge `main` / UI redesign
- Do **not** expand SMTP beyond thin 3.9 (no Event/RSVP mail)
- Do **not** commit `.env.production.local` or Resend secrets
