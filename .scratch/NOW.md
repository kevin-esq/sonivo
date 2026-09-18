# NOW — agent focus

**Updated:** 2026-09-18

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-SYNC-01 ChordTimingJson persistence + API)
Human approval: PENDING (auditor)
Git checkpoint: COMMITTED (pending push/PR this turn)
Remote: NOT PUSHED → PUSHED with PR → develop (do not merge; auditor)
CI: NOT RUN / pending
```

## Authorized program

Kevin: fulfill original ChordPro+IA ask; parent acts as auditor; builders implement; merge/delete branches when PASS.

| Wave | Scope | Status |
|------|-------|--------|
| ADR-0031 T-SYNC-00 | Docs: ADR + PHASE-PLAY-SYNC-SPEC + AGENTS/CONTEXT | MERGED (`9cc1e5f` / PR #80) |
| ADR-0031 T-SYNC-01 | Migration ChordTimingJson + GET/PATCH + tests | PR → develop (auditor) |
| ADR-0031 T-SYNC-02–03 | Owner marks UI + Practice highlight + TC-PLAY-SYNC-01 | AFTER T-SYNC-01 merge |
| ADR-0032+ | Whisper audio digitizer thin | AFTER 0031 impl |
| Q9 / S3 / LLM / pitch / YouTube | Still need separate ADRs after core | LATER in same program |

## Deferred until their ADR

Pitch · YouTube · karaoke scoring · multi-device Q9 · S3 >5MiB · cloud LLM upgrade of P1/P2 · ML auto-marks (unless Kevin expands 0032)
