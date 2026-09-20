# NOW — agent focus

**Updated:** 2026-09-20

## Checkpoint state (required)

```text
Implementation: COMPLETE (T-SYNC-02 Owner timing editor + T-SYNC-03 Practice follow-along + TC-PLAY-SYNC-01)
Human approval: APPROVED (Kevin: "Apruebo todo" 2026-09-20)
Git checkpoint: COMMITTED + MERGED to develop (PR #82, 887a2b3; branch deleted)
Remote: PUSHED + MERGED
CI: PASSING (Backend + Frontend + Playwright E2E 25/25, run 35529555652)
```

## Authorized program

Kevin: fulfill original ChordPro+IA ask; parent acts as auditor; builders implement; merge/delete branches when PASS.

| Wave | Scope | Status |
|------|-------|--------|
| ADR-0031 T-SYNC-00 | Docs: ADR + PHASE-PLAY-SYNC-SPEC + AGENTS/CONTEXT | MERGED (`9cc1e5f` / PR #80) |
| ADR-0031 T-SYNC-01 | Migration ChordTimingJson + GET/PATCH + tests | MERGED (PR #81) |
| ADR-0031 T-SYNC-02–03 | Owner marks UI + Practice highlight + TC-PLAY-SYNC-01 | MERGED (`887a2b3` / PR #82, CI green 25/25) |
| Wave A T-W32-00 | ADR-0032 PROPOSED docs + PHASE-WHISPER-SPEC.md skeleton (docs only) | MERGED (`bdf092f` / PR #83, CI green); ADR-0032 still PROPOSED — Kevin answers W32-Q1–Q7 pending |
| ADR-0032+ | Whisper audio digitizer thin implementation (T-W32-01–03) | BLOCKED on ADR-0032 ACCEPTANCE |
| Q9 / S3 / LLM / pitch / YouTube | Still need separate ADRs after core | LATER in same program |

## Deferred until their ADR

Pitch · YouTube · karaoke scoring · multi-device Q9 · S3 >5MiB · cloud LLM upgrade of P1/P2 · ML auto-marks (unless Kevin expands 0032)
