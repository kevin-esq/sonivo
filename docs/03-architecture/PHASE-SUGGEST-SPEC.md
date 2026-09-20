# Phase ML timing-mark suggest, review-gated (ADR-0034)

**Status:** ADR-0034 **ACCEPTED** 2026-09-20 (HUMAN-DELEGATED, technical spend-free scope). Implementation T-W34-01 **AUTHORIZED** on branch `feature/t-w34-suggest-marks`.
**Product bet:** One click maps transcript segments onto lyric-bearing ChordPro lines (skipping directives/blanks) — Owner still reviews and saves explicitly.
**Date:** 2026-09-20
**Depends on:** ADR-0034 (ACCEPTED), ADR-0032 (segments + review UX), ADR-0025 (PATCH/409), ADR-0028 (ChordPro).

---

## Frozen mechanics (binding)

| ID | Decision |
| -- | -------- |
| Q-W34-1 | Pure client `suggestLineMapping(chordProText, segmentCount)` in `digitize.ts`: lyric-bearing = trimmed non-blank lines NOT matching `/^\{.*\}$/`; segment i → i-th lyric line; overflow clamps to last lyric line; no lyric lines (or null/blank body) → identity clamped to `max(lineCount - 1, 0)`; zero segments → `[]`. |
| Q-W34-2 | UI: “Sugerir mapeo” button (`digitize-suggest`) in the ready phase fills line inputs only. Aplicar/Añadir/Descartar unchanged; suggest never persists. |
| Q-W34-3 | No server changes, no migration, no new deps. Spanish copy. |
| Q-W34-4 | Playwright **TC-WSP-02**: speech fixture; chords `{start_of_verse}` / lyric / blank / lyric / `{end_of_verse}`; assert suggested lines `1` and `3`; apply; Practice “Seguir letra” toggle appears. Mechanics only (`expect.poll`, no fixed sleeps). |
| Q-W34-5 | **OUT:** auto-save, cloud LLM, server mapping, Q9, pitch, YouTube, S3, MusicXML. |

---

## Tickets

| ID | Work | Status |
| -- | ---- | ------ |
| **T-W34-01** | Util + button + TC-WSP-02 + suite green | Authorized — builder (this branch) |

---

## Audit checklist

- [ ] No server diff; no new deps
- [ ] Suggest fills inputs only; save path unchanged (PATCH + 409)
- [ ] Spanish copy
- [ ] TC-WSP-02 green + full suite green
- [ ] No Cursor co-author trailers
