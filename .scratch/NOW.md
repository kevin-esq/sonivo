# NOW — agent focus

**Updated:** 2026-09-18

## Checkpoint state (required)

```text
Implementation: COMPLETE (ADR-0030 P0 T-C30-01–05)
Human approval: PENDING (await auditor)
Git checkpoint: COMMITTED (this PR)
Remote: PUSHED (feature/t-c30-transpose-views → develop PR)
CI: Local Playwright 22/22 PASS; GitHub CI pending
```

## Module ADR-0030

1. Docs ADR + PHASE-CHORDPRO-IA-SPEC — DONE (PR #68)
2. P0 transpose + views — **this PR** (T-C30-01–05)
3. P1 text digitizer — not started
4. P2 compose assist — not started

## P0 notes

- Transpose convention: **sharps preferred** (Am +1 → A#m); flats only when source root used `b`
- Guardar tono: PATCH chords; `defaultKey` updated only for simple single-token keys (else skip)

## Firewall

- No Cursor trailers
- No Whisper / cloud LLM / Q9 / pitch / YouTube / Event mail / P1/P2
