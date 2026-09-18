# Phase Formats — ChordPro hybrid (Wave 1 / Q8)

**Status:** COMPLETE 2026-09-17 (T-FMT-01–06). ADR-0028 **ACCEPTED**.  
**Product bet:** Owners edit ChordPro in Arrangement; Members see readable chords+lyrics in Practice; PDF charts stay as Resources.  
**Date:** 2026-09-17  
**Depends on:** ADR-0028, 0025, 0027; T-3.2.06 file Resources.

---

## Frozen mechanics

| ID | Decision |
| -- | -------- |
| Q-F8-1 | Hybrid: ChordPro in `Arrangement.Chords` (+ optional plain/`Lyrics`); `chart` Resource = PDF/image |
| Q-F8-2 | No new DB columns; existing max body length |
| Q-F8-3 | Server: opaque text within length — no hard ChordPro schema reject |
| Q-F8-4 | Web renderer: ChordPro → chords-over-lyrics; else `<pre>` |
| Q-F8-5 | Owner UI: edit Chords with live preview; import `.cho`/`.chordpro`/`.txt` client-side into field |
| Q-F8-6 | Practice page uses same renderer for Chords (prefer) then Lyrics |
| Q-F8-7 | Spanish labels; Playwright TC-FMT-01 |

---

## Scope

| In | Out |
| -- | --- |
| Web ChordPro detect/render helper + tests | MusicXML, transpose engine |
| Arrangement edit: Chords field + preview + import file→text | Storing .cho only as blob without Arrangement body |
| Practice display upgrade | Realtime sync, pitch |
| Playwright TC-FMT-01 | OCR |

---

## Tickets

| ID | Work |
| -- | ---- |
| T-FMT-01 | `chordPro.ts` detect + render (unit tests in web or vitest if present; else pure TS + Playwright) |
| T-FMT-02 | Arrangement detail: Chords editor + Vista previa + import file |
| T-FMT-03 | Practice page: render ChordPro from Chords/Lyrics |
| T-FMT-04 | Docs: CONTEXT Q8 closed; AGENTS ADR-0028; PHASE status |
| T-FMT-05 | Playwright TC-FMT-01: set ChordPro chords → Practicar shows chord token / lyric line |
| T-FMT-06 | Keep full e2e green (17+) |

Ship **one PR** `feature/t-fmt-chordpro` → `develop` (implementation). ADR+this spec may ship in a docs PR first or same PR.

---

## Audit checklist

- [x] No MusicXML / realtime / pitch  
- [x] No new aggregates / migrations unless unavoidable  
- [x] Practice + Arrangement Spanish copy  
- [x] TC-FMT-01 + full Playwright green  
- [x] No Cursor trailers  
