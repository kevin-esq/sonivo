# Phase Whisper audio digitizer thin (ADR-0032)

**Status:** ADR-0032 **ACCEPTED** 2026-09-20 (auditor-decided W32-Q1–Q7, HUMAN-DELEGATED). Implementation T-W32-01–03 **AUTHORIZED** on branch `feature/t-w32-digitizer-thin`.
**Product bet:** An existing Arrangement audio file becomes an Owner-reviewed timing-mark + lyric draft — without cloud LLM, unattended ML auto-marks, or Q9 realtime.
**Date:** 2026-09-20
**Depends on:** ADR-0032 (ACCEPTED), 0019, 0020, 0024, 0025, 0027, 0028, 0029, 0030, 0031; T-3.2.06 file/link Resources; [`PHASE-PLAY-SYNC-SPEC.md`](PHASE-PLAY-SYNC-SPEC.md).

---

## Frozen mechanics (binding)

| ID | Decision |
| -- | -------- |
| Q-W32-1 | Persisted contract stays the existing columns: `Arrangement.Lyrics` (plain text append target) and `Arrangement.ChordTimingJson` (timing marks, ADR-0031). **No new tables. No migration. `Arrangement.Chords` is NEVER written by the digitizer.** |
| Q-W32-2 | Digitizer output is a **draft** until an Owner explicitly saves via the existing Arrangement PATCH (`expectedVersion` / 409 per ADR-0025). No auto-save of ML output. Mark apply uses upsert semantics (hand-made marks on other lines preserved). |
| Q-W32-3 | Provider: local whisper.cpp via Whisper.net; default model `tiny` (config `base`). No vendor secrets. |
| Q-W32-4 | Execution: async job. `POST .../digitize {resourceId}` → `202 {jobId, status}`; `GET .../digitize/{jobId}` → `{status: queued\|processing\|done\|failed, segments?[{startMs,endMs,text}], error?}`. In-memory job store with 30-min expiry (restarts may drop in-flight jobs — documented). |
| Q-W32-5 | Eligibility: `file`-kind Resources with playable audio MIME, purposes `audio`/`practice`/`click`. Links OUT. |
| Q-W32-6 | Caps: blob ≤5 MiB (unchanged) + duration ≤120s + segments ≤500. Over-cap fails the job with a clear error; never partial writes. |
| Q-W32-7 | Config (no secrets): `Whisper:Model` (default `tiny`), `Whisper:ModelDirectory`, `Whisper:MaxAudioSeconds` (default 120). Lazy `.bin` download; never in git/DB. |
| Q-W32-8 | AuthZ: Owner-only endpoints (`RequireOwnerAsync` pattern; per-request group+arrangement check → 404 non-member/unknown, 403 member non-Owner). CSRF on POST per ADR-0020. |
| Q-W32-9 | Testability: transcription behind an `IAudioTranscriber` interface; unit/API tests run against a fake (no model download in tests). E2E TC-WSP-01 uses the real `tiny` model on the 3s fixture and asserts mechanics (job done → review renders → apply → Practice toggle), not transcript quality. |
| Q-W32-10 | Spanish UI (“Digitalizar audio”, “Revisar borrador”, “Aplicar marcas”, “Añadir a letra”, “Descartar”). |
| Q-W32-11 | **OUT (firewall):** cloud LLM rewriting (Wave B), unattended ML auto-marks (Wave C), Q9 realtime, pitch, YouTube, S3, raising 5 MiB, MusicXML / Guitar Pro, Event/RSVP mail. |

---

## Frozen mechanics (binding)

| ID | Decision |
| -- | -------- |
| Q-W32-1 | Persisted contract stays the existing columns: `Arrangement.Lyrics` (plain text append target) and `Arrangement.ChordTimingJson` (timing marks, ADR-0031). **No new tables. No migration. `Arrangement.Chords` is NEVER written by the digitizer.** |
| Q-W32-2 | Digitizer output is a **draft** until an Owner explicitly saves via the existing Arrangement PATCH (`expectedVersion` / 409 per ADR-0025). No auto-save of ML output. Mark apply uses upsert semantics (hand-made marks on other lines preserved). |
| Q-W32-3 | Provider: local whisper.cpp via Whisper.net; default model `tiny` (config `base`). No vendor secrets. |
| Q-W32-4 | Execution: async job. `POST .../digitize {resourceId}` → `202 {jobId, status}`; `GET .../digitize/{jobId}` → `{status: queued\|processing\|done\|failed, segments?[{startMs,endMs,text}], error?}`. In-memory job store with 30-min expiry (restarts may drop in-flight jobs — documented). |
| Q-W32-5 | Eligibility: `file`-kind Resources with playable audio MIME, purposes `audio`/`practice`/`click`. Links OUT. |
| Q-W32-6 | Caps: blob ≤5 MiB (unchanged) + duration ≤120s + segments ≤500. Over-cap fails the job with a clear error; never partial writes. |
| Q-W32-7 | Config (no secrets): `Whisper:Model` (default `tiny`), `Whisper:ModelDirectory`, `Whisper:MaxAudioSeconds` (default 120). Lazy `.bin` download; never in git/DB. |
| Q-W32-8 | AuthZ: Owner-only endpoints (`RequireOwnerAsync` pattern; per-request group+arrangement check → 404 non-member/unknown, 403 member non-Owner). CSRF on POST per ADR-0020. |
| Q-W32-9 | Testability: transcription behind an `IAudioTranscriber` interface; unit/API tests run against a fake (no model download in tests). E2E TC-WSP-01 uses the real `tiny` model on the 3s fixture and asserts mechanics (job done → review renders → apply → Practice toggle), not transcript quality. |
| Q-W32-10 | Spanish UI (“Digitalizar audio”, “Revisar borrador”, “Aplicar marcas”, “Añadir a letra”, “Descartar”). |
| Q-W32-11 | **OUT (firewall):** cloud LLM rewriting (Wave B), unattended ML auto-marks (Wave C), Q9 realtime, pitch, YouTube, S3, raising 5 MiB, MusicXML / Guitar Pro, Event/RSVP mail. |

---

## Scope

| In (thin) | Out |
| --------- | --- |
| Transcribe endpoint + polling (T-W32-01) | New persistence tables / migrations |
| Owner review-and-save UX incl. per-segment line assignment (T-W32-02, Spanish) | Auto-save / unattended marks (Wave C) |
| Unit + API tests with fake transcriber; E2E TC-WSP-01 with real tiny model (T-W32-03) | Cloud LLM rewrite (Wave B) |
| Whisper.net NuGet (pinned, justified by this ADR) | Q9 realtime, pitch, YouTube, S3, 5 MiB raise, MusicXML |

---

## Tickets

| ID | Work | Status |
| -- | ---- | ------ |
| **T-W32-00** | Docs: ADR-0032 PROPOSED + spec skeleton + NOW update | MERGED (PR #83) |
| **T-W32-00b** | ADR-0032 ACCEPTED (auditor-decided W32-Q1–Q7, HUMAN-DELEGATED) + spec frozen | This branch, this commit |
| **T-W32-01** | Server: `IAudioTranscriber` + Whisper.net job endpoints (202 + poll) + caps + unit/API tests with fake | Authorized — builder |
| **T-W32-02** | Web: Owner review UX (segment list, per-segment line assignment, apply marks via PATCH upsert, append-to-Lyrics, discard; Spanish) | Authorized — builder |
| **T-W32-03** | Tests: TC-WSP-01 Playwright (real tiny model, mechanics assertions) + suite green | Authorized — builder |

Branch for implementation: `feature/t-w32-digitizer-thin` (this branch; one coherent vertical slice).

---

## API / persistence notes (proposed, binding only after ACCEPTANCE)

- No migration in thin: reuse `Arrangement.Chords` (text) and `Arrangement.ChordTimingJson` (nullable JSON text) columns.
- Any draft-ephemeral state (server or client) must be justified in T-W32-01/02 tickets; drafts MUST NOT become a shadow second body of record.
- AuthZ: Owner write / Member read, same as Arrangement body fields (ADR-0019, 0025). CSRF per ADR-0020.
- Concurrency: existing integer `Version` / 409 unchanged; draft save is a normal PATCH.
- No new dependencies in thin beyond what W32-Q1 answers; no secrets in git.

---

## Audit checklist (each implementation PR, after ACCEPTANCE)

- [ ] No cloud LLM / unattended ML auto-marks / Q9 / pitch / YouTube / S3 / 5 MiB raise
- [ ] No new persistence tables (existing `Chords` + `ChordTimingJson` only)
- [ ] Owner review-and-save required before any ML output persists
- [ ] Spanish copy
- [ ] Named Playwright TC when T-W32-03 ships + suite green
- [ ] No Cursor co-author trailers
