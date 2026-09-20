# NOW — agent focus

**Updated:** 2026-09-20

## Checkpoint state (required)

```text
Implementation: COMPLETE (Wave C T-W34-01 suggest + TC-WSP-02)
Human approval: DELEGATED (Kevin: auditor decides + merges when correct, 2026-09-20)
Git checkpoint: COMMITTED + MERGED to develop (PR #86, a4ede4a; branch deleted)
Remote: PUSHED + MERGED
CI: PASSING (Backend + Frontend + Playwright E2E 27/27, run 35540151788)
```

## Authorized program

Kevin: fulfill original ChordPro+IA ask; parent acts as auditor; builders implement; merge/delete branches when PASS.

| Wave | Scope | Status |
|------|-------|--------|
| ADR-0031 T-SYNC-00 | Docs: ADR + PHASE-PLAY-SYNC-SPEC + AGENTS/CONTEXT | MERGED (`9cc1e5f` / PR #80) |
| ADR-0031 T-SYNC-01 | Migration ChordTimingJson + GET/PATCH + tests | MERGED (PR #81) |
| ADR-0031 T-SYNC-02–03 | Owner marks UI + Practice highlight + TC-PLAY-SYNC-01 | MERGED (`887a2b3` / PR #82, CI green 25/25) |
| Wave A T-W32-00 | ADR-0032 PROPOSED docs + PHASE-WHISPER-SPEC.md skeleton (docs only) | MERGED (`bdf092f` / PR #83) |
| Wave A T-W32-00b | ADR-0032 ACCEPTED (auditor-decided W32-Q1–Q7, HUMAN-DELEGATED) + spec frozen | MERGED in PR #84 |
| Wave A T-W32-01–03 | Whisper digitizer thin: transcribe job + Owner review UX + TC-WSP-01 | MERGED (`a5f2272` / PR #84, CI green 26/26) |
| Wave B T-LLM-00 | Docs: ADR-0033 PROPOSED + PHASE-LLM-SPEC.md skeleton (docs only) | MERGED (`98e015a` / PR #85) → CLOSED Option C, ADR-0033 SUPERSEDED (PR #86) |
| Wave C T-W34-01 | ADR-0034 ACCEPTED (review-gated suggest) + util + button + TC-WSP-02 | MERGED (`a4ede4a` / PR #86, CI green 27/27) — Wave C CLOSED |
| Q9 / S3 / LLM / pitch / YouTube | Still need separate ADRs after core | LATER in same program |

## Deferred until their ADR

Pitch · YouTube · karaoke scoring · multi-device Q9 · S3 >5MiB · cloud LLM upgrade of P1/P2 · ML auto-marks (unless Kevin expands 0032)
