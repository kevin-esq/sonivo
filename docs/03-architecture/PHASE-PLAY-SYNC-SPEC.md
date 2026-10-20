# Phase Practice ChordPro follow-along (ADR-0031)

**Status:** **COMPLETE** — T-SYNC-00 merged (PR #80); T-SYNC-01 merged (PR #81); T-SYNC-02–03 merged (PR #82, TC-PLAY-SYNC-01 green). ADR-0031 **ACCEPTED**.
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

---

## Owner-authorized follow-on — immersive singing view

The product owner authorized a karaoke-inspired singing mode for Practice, informed by
Apple Music Sing. This is a presentation of existing song data, not karaoke scoring.

| ID | Work | Status |
| -- | ---- | ------ |
| **T-SYNC-04** | Add an immersive, responsive singing view with large high-contrast lyrics, clear current-line focus, automatic follow from existing `ChordTimingJson` while an authorized local audio track plays, accessible manual line navigation, and an in-view chord visibility control. | IMPLEMENTED LOCALLY |
| **T-SYNC-05** | Add an owner-authorized second-screen stage output with a lyrics-only external window, live controller preview, presentation controls, and local playback volume control. | IMPLEMENTED LOCALLY |
| **T-SYNC-06** | Add backward-compatible manual word timing and explicit instrumental intervals to Arrangement timing data; let an Owner mark/edit them against existing audio and render word-level focus in Practice Stage and its same-browser output. | IMPLEMENTED LOCALLY |

T-SYNC-04/05 use the existing audio player and line marks. **ADR-0096 supersedes the line-only
limit for T-SYNC-06:** manually authored word intervals and instrumental intervals may drive
word-level focus where they exist; arrangements without them retain line-level behavior. No
vocal isolation, multitrack stems, recording, scoring, audio sync between members, or new
persistence is included. YouTube remains an unsynchronized reference per ADR-0037. The mode is
launched from Practice, not from a group-type field (Groups currently have no authoritative
choir/band classification).

T-SYNC-05 is a same-browser, same-origin display feature. The main Practice window remains
the controller and preview, including audio playback/volume, line/word navigation, chord display,
font size, and follow/scroll settings. A separate window loads the same group-scoped Practice
route and reads the arrangement through its existing authorized API path. A session-scoped
`BroadcastChannel` carries only validated presentation state; it does not carry lyrics, audio,
or raw playhead time. T-SYNC-06 may include active word indexes and bounded word/instrumental
progress. The second window renders only the selected lyric/chord presentation.
The browser's Window Management API may request display permission and position the window
on an extended display; if unsupported or denied, the window opens for manual placement. No
new backend endpoint, persistence, cross-device synchronization, or audio transmission is
included.

### T-SYNC-06 contract

- Keep `ChordTimingJson` as a JSON array and accept legacy line marks `{ lineIndex, atMs }`.
- Add `{ lineIndex, wordIndex, startMs, endMs }` word intervals and
  `{ type: "instrumental", startMs, endMs }` intervals. Validate integer non-negative
  values, positive interval length, valid line/word references where the lyric body is
  available, and the existing maximum mark count.
- In the Arrangement editor, the existing lyric editor is the text source; no `.lrc` or
  separate lyric file is required. An existing authorized audio Resource is the timing
  reference. Support marking the next word at the current audio position, closing the
  current word, editing/nudging times, and marking/closing an instrumental interval.
- Keep line marks as a fallback for old clients and for lines without word timing. Do not
  estimate word timing from BPM, line duration, or silence.
- In Stage, fill the active word according to the audio clock; completed and upcoming words
  remain visually distinguishable. An explicit instrumental interval shows a quiet cue and
  interval progress. Honor `prefers-reduced-motion` and preserve readable contrast.
- The Stage output receives only bounded indexes/progress via the validated same-origin
  channel. It reads the arrangement through the existing authorized route and never receives
  lyrics, audio bytes, or raw audio position.
