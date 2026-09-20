# Phase Whisper audio digitizer thin (ADR-0032)

**Status:** **PROPOSED** — T-W32-00 docs skeleton. ADR-0032 is **PROPOSED**, not ACCEPTED. Implementation T-W32-01–03 **not authorized** until Kevin answers W32-Q1–Q7 and ACCEPTS the ADR.
**Product bet:** An existing Arrangement audio Resource becomes an Owner-reviewed ChordPro and/or timing draft — without cloud LLM, unattended ML auto-marks, or Q9 realtime.
**Date:** 2026-09-20
**Depends on:** ADR-0032 (PROPOSED), 0024, 0025, 0027, 0028, 0029, 0030, 0031; T-3.2.06 file/link Resources; [`PHASE-PLAY-SYNC-SPEC.md`](PHASE-PLAY-SYNC-SPEC.md).

---

## Frozen mechanics (proposed — open items are questions, not decisions)

| ID | Proposal / open question |
| -- | ------------------------ |
| Q-W32-1 | Persisted contract stays the existing columns: `Arrangement.Chords` (ChordPro body, ADR-0028) and `Arrangement.ChordTimingJson` (timing marks, ADR-0031). **No new tables in thin.** |
| Q-W32-2 | Digitizer output is a **draft** until an Owner explicitly saves via the existing Arrangement PATCH (`expectedVersion` / 409 per ADR-0025). No auto-save of ML output. |
| Q-W32-3 | **OPEN QUESTION W32-Q1:** provider — local whisper.cpp vs hosted Whisper-compatible API? Undecided; no recommendation in this spec. |
| Q-W32-4 | **OPEN QUESTION W32-Q2:** sync request/response vs async job with polling? Undecided. |
| Q-W32-5 | **OPEN QUESTION W32-Q3:** which audio Resource is eligible — file vs link; purpose `audio` vs `practice` vs `click`? Undecided. |
| Q-W32-6 | **OPEN QUESTION W32-Q4:** thin output — ChordPro body draft vs timing-mark drafts vs both? Undecided; scopes T-W32-01–03. |
| Q-W32-7 | **OPEN QUESTION W32-Q5:** duration / size caps for digitized audio? Undecided; 5 MiB blob cap is NOT raised by this thin. |
| Q-W32-8 | **OPEN QUESTION W32-Q6:** secrets / config model? Undecided; no secrets in git. |
| Q-W32-9 | **OPEN QUESTION W32-Q7:** Owner-only drafts with review-and-save UX (proposed) vs any Member visibility of pending drafts? Unconfirmed. |
| Q-W32-10 | Spanish UI for any draft review surface (e.g. “Revisar borrador”, “Descartar”, “Guardar en arreglo”). Route/naming fixed at implementation time. |
| Q-W32-11 | **OUT (firewall):** cloud LLM rewriting (Wave B), unattended ML auto-marks (Wave C), Q9 realtime, pitch, YouTube, S3, raising 5 MiB, MusicXML / Guitar Pro, Event/RSVP mail. |

---

## Scope

| In (proposed thin) | Out |
| ------------------ | --- |
| Draft from existing audio Resource into `Chords` and/or `ChordTimingJson` | New persistence tables |
| Owner review-and-save UX (Spanish) | Auto-save / unattended ML marks (Wave C) |
| Member read of saved body/marks (unchanged semantics) | Cloud LLM rewrite (Wave B) |
| Sparse Playwright TCs (names fixed at impl time) | Q9 realtime, pitch, YouTube, S3, 5 MiB raise, MusicXML |

---

## Tickets

| ID | Work | Status |
| -- | ---- | ------ |
| **T-W32-00** | This docs PR: ADR-0032 **PROPOSED** + this spec skeleton + NOW update | **IN PROGRESS (docs only; this branch)** |
| **T-W32-01** | Sketch: transcription input — eligible audio Resource selection + execution model (sync vs job) + caps. Binds on W32-Q1/Q2/Q3/Q5 answers | Later — needs ADR ACCEPTED |
| **T-W32-02** | Sketch: draft review UX — Owner review/discard/save into `Chords` and/or `ChordTimingJson` (Spanish). Binds on W32-Q4/Q7 answers | Later — needs ADR ACCEPTED |
| **T-W32-03** | Sketch: tests — unit/API for draft→PATCH path + sparse Playwright TC for review-and-save | Later — needs ADR ACCEPTED |

Branch naming (implementation, after ACCEPTANCE): `feature/t-w32-01-transcribe-input`, `feature/t-w32-02-draft-review`, `feature/t-w32-03-digitizer-tests` (or one coherent vertical slice if human batches).

Docs branch for T-W32-00: `docs/adr-0032-whisper`.

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
