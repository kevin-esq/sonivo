# NOW — agent focus

**Updated:** 2026-09-20

## Checkpoint state (required)

```text
Implementation: COMPLETE (Wave E T-Q9-01-03 conductor + Wave F T-FX-01-02 tuner/YT)
Human approval: DELEGATED (Kevin: auditor decides + merges when correct + blanket improvement mandate, 2026-09-21)
Git checkpoint: COMMITTED + MERGED to develop (PR #90 d1491e5 + PR #91 8e67578; branches deleted)
Remote: PUSHED + MERGED
CI: PASSING (both PRs: Backend + Frontend + Playwright E2E green)
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
| Wave D T-R2-00 | Docs: ADR-0035 PROPOSED (R2 blob backend thin) + PHASE-R2-SPEC.md skeleton (docs only) | IN PROGRESS (this branch, docs only) — PENDING, NOT merged |
| Wave E T-Q9-00 | Docs: ADR-0036 PROPOSED (Q9 realtime thin) + PHASE-Q9-SPEC.md skeleton (docs only) | PLANNED |
| Wave F T-FX-00 | Docs: ADR-0037 PROPOSED (Practice extras scope) + PHASE-EXTRAS-SPEC.md skeleton (docs only) | PLANNED |
| Wave E T-Q9-01–03 | ADR-0036 ACCEPTED + SignalR conductor room + presence + TC-Q9-01 | MERGED (PR #90, CI green incl. E2E two-context follow) |
| Wave F T-FX-01–02 | ADR-0037 ACCEPTED (tuner IN, YT conditional IN, scoring OUT) + Afinador + nocookie embed + TC-PITCH-01/TC-YT-01 | MERGED (PR #91, CI green) — scoring OUT, no work |
| Wave D T-R2-01–03 | ADR-0035 PROPOSED + PHASE-R2-SPEC.md | MERGED docs (PR #87); impl BLOCKED on Kevin: bucket sonivo-blobs + token + R2-Q answers |

## Deferred until their ADR

Pitch · YouTube · karaoke scoring · multi-device Q9 · S3 >5MiB · cloud LLM upgrade of P1/P2 · ML auto-marks (unless Kevin expands 0032)
