# NOW — agent focus

**Updated:** 2026-09-20

## Checkpoint state (required)

```text
Implementation: IN PROGRESS (Security Wave S2 T-AU-02: TOTP 2FA + recovery codes + second-step login, on feature/t-au-02-totp, PR open)
Human approval: DELEGATED (Kevin: auditor decides + merges when correct, 2026-09-21/22)
Git checkpoint: COMMITTED + PUSHED (PR to develop, NOT merged — CI is the gate)
Remote: PUSHED
CI: NOT RUN (awaiting PR checks)
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
| Wave D T-R2-00 | Docs: ADR-0035 PROPOSED (R2 blob backend thin) + PHASE-R2-SPEC.md skeleton (docs only) | MERGED docs (PR #87); ACCEPTED 2026-09-21 HUMAN-DELEGATED (auditor-resolved R2-Q1–Q7), spec frozen |
| Wave D T-R2-01–03 | ADR-0035 impl: R2BlobStore + dual-read/backfill + tests | ACTIVE on `feature/t-r2-blobstore` |
| Wave E T-Q9-00 | Docs: ADR-0036 PROPOSED (Q9 realtime thin) + PHASE-Q9-SPEC.md skeleton (docs only) | PLANNED |
| Wave F T-FX-00 | Docs: ADR-0037 PROPOSED (Practice extras scope) + PHASE-EXTRAS-SPEC.md skeleton (docs only) | PLANNED |
| Wave E T-Q9-01–03 | ADR-0036 ACCEPTED + SignalR conductor room + presence + TC-Q9-01 | MERGED (PR #90, CI green incl. E2E two-context follow) |
| Wave F T-FX-01–02 | ADR-0037 ACCEPTED (tuner IN, YT conditional IN, scoring OUT) + Afinador + nocookie embed + TC-PITCH-01/TC-YT-01 | MERGED (PR #91, CI green) — scoring OUT, no work |
| Wave D T-R2-01–03 | ADR-0035 ACCEPTED + R2BlobStore + dual-read/backfill + tests + live R2 verification | MERGED (PR #92, CI green; E2E also 31/31 local on live R2 path) — Wave D CLOSED; PROD LIVE with R2 backend (Render redeploy, log-verified) |
| Security Wave S0 | ADR-0038 PROPOSED (auth hardening: verification + TOTP + passkeys) + PHASE-AUTH-SPEC | MERGED docs (PR #96, CI green) → ACCEPTED 2026-09-21 HUMAN-DELEGATED (S1 active, S2/S3 gated sequential) |
| Security Wave S1 | T-AU-01: verification endpoints + login gate + HSTS + rate limits + tests (+ auditor double-gate fix on test hook) | MERGED (PR #97, CI green incl. E2E) — S1 CLOSED; S2 TOTP next |
| Security Wave S2 | T-AU-02: TOTP enroll/verify/disable + recovery codes + second-step login + tests | ACTIVE on `feature/t-au-02-totp` (PR open, CI pending) |
| Security Wave S0 | ADR-0038 PROPOSED + PHASE-AUTH-SPEC | MERGED docs (PR #96, CI green) → ACCEPTED 2026-09-21 HUMAN-DELEGATED |

## Deferred until their ADR

Pitch (tuner SHIPPED, PR #91) · YouTube (reference embed SHIPPED, PR #91) · karaoke scoring (OUT, ADR-0037) · multi-device Q9 (SHIPPED conductor thin, PR #90) · S3 >5MiB (R2 live, cap unchanged) · cloud LLM upgrade of P1/P2 (CLOSED Option C, ADR-0033) · ML auto-marks (SHIPPED review-gated, PRs #84/#86)
