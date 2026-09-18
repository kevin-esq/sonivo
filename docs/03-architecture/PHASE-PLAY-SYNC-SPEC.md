# Phase Practice ChordPro follow-along (ADR-0031)

**Status:** Docs (T-SYNC-00) **IN PROGRESS** → COMPLETE when this PR merges. Implementation T-SYNC-01–03 **AUTHORIZED**, not started. ADR-0031 **ACCEPTED**.  
**Product bet:** While Practice audio plays, ChordPro highlights the current line from Owner-authored time marks — without Whisper, cloud LLM, or Q9 realtime.  
**Date:** 2026-09-18  
**Depends on:** ADR-0031, 0027, 0028, 0029, 0030; [`PHASE-PLAYER-SPEC.md`](PHASE-PLAYER-SPEC.md).

---

## Frozen mechanics

| ID | Decision |
| -- | -------- |
| Q-SYNC-1 | Chart SoT remains `Arrangement.Chords` (ChordPro). Timing is a separate map, not a second ChordPro body. |
| Q-SYNC-2 | Persist marks in nullable `Arrangement.ChordTimingJson` (string / JSON text). **No new table.** Do **not** overload `Notes`. |
| Q-SYNC-3 | JSON shape: array of `{ "lineIndex": number, "atMs": number }` — `lineIndex` 0-based into ChordPro lines used by the editor; `atMs` milliseconds on the playing audio. Null/empty/[] = no marks. |
| Q-SYNC-4 | Owner PATCH create/edit/clear marks; Member GET + Practice consume read-only. |
| Q-SYNC-5 | Practice: optional toggle **“Seguir letra”**; when on and marks exist, highlight current line/block from HTML5 `timeupdate` / seek (ADR-0029 chrome). Preference may live in `localStorage`. |
| Q-SYNC-6 | Highlight = current line (or contiguous block sharing the active mark). Thin may auto-scroll the highlighted line into view; no multi-device conductor. |
| Q-SYNC-7 | Spanish UI; Playwright **TC-PLAY-SYNC-01** in T-SYNC-03. |
| Q-SYNC-8 | **OUT:** Whisper, cloud LLM, ML auto-marks, Q9 realtime, pitch, YouTube, S3, raising 5 MiB. |

---

## Scope

| In | Out |
| -- | --- |
| `ChordTimingJson` column + Arrangement GET/PATCH | New aggregates / timing table |
| Owner UI to set/edit line timings against audio | Whisper / STT / ML mark generation |
| Practice highlight + “Seguir letra” | Multi-device / websocket sync (Q9) |
| TC-PLAY-SYNC-01 | Pitch, YouTube, S3, cloud LLM |

---

## Tickets

| ID | Work | Status |
| -- | ---- | ------ |
| **T-SYNC-00** | This docs PR: ADR-0031 **ACCEPTED** + this spec + light AGENTS/CONTEXT/NOW | **COMPLETE when merged** |
| **T-SYNC-01** | EF migration `ChordTimingJson` on Arrangements; Domain/Application/API GET+PATCH; unit/API tests; validate JSON shape (soft reject malformed) | Later |
| **T-SYNC-02** | Owner UI: set/edit/clear line timings while listening (Spanish); save via PATCH | Later |
| **T-SYNC-03** | Practice: “Seguir letra” + highlight from marks + `timeupdate`; Playwright **TC-PLAY-SYNC-01** | Later |

Branch naming (implementation): `feature/t-sync-01-chord-timing`, `feature/t-sync-02-owner-marks`, `feature/t-sync-03-practice-highlight` (or one coherent vertical slice if human batches).

Docs branch for T-SYNC-00: `docs/adr-0031-play-sync`.

---

## API / persistence notes (binding for T-SYNC-01)

- Column: nullable string on Arrangement, e.g. `ChordTimingJson` (Postgres `text` / EF string).  
- Serialization: UTF-8 JSON array; order SHOULD be ascending by `atMs`. Duplicate `lineIndex` allowed only if product needs block splits — thin prefer one mark per line; last-write or last-in-array wins for a given `lineIndex` if duplicates appear (document in API tests).  
- AuthZ: same as Arrangement PATCH (Owner write; Member read). CSRF per ADR-0020.  
- Concurrency: existing integer `Version` / 409 unchanged.  
- Max body: keep within existing Arrangement text limits; if needed, cap mark count in Application (document chosen cap in T-SYNC-01 PR).

---

## Audit checklist (each implementation PR)

- [ ] No Whisper / cloud LLM / Q9 / pitch / YouTube / S3 / 5 MiB raise  
- [ ] No new timing table (column only)  
- [ ] Spanish copy  
- [ ] Named Playwright TC when T-SYNC-03 ships + suite green  
- [ ] No Cursor co-author trailers  
