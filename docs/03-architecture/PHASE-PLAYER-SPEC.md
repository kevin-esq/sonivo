# Phase Player — Practice audio (Wave 2 / ADR-0029)

**Status:** AUTHORIZED 2026-09-17 (Kevin Esquivel — “Acepto todo”). ADR-0029 **ACCEPTED**.  
**Product bet:** Musicians rehearse with seek/volume/track choice while reading ChordPro/lyrics — without realtime.  
**Date:** 2026-09-17  
**Depends on:** ADR-0029, 0027, 0028; T-3.2.06.

---

## Frozen mechanics

| ID | Decision |
| -- | -------- |
| Q-P2-1 | Arrangement-scoped Practice player only in Wave 2 (no Event/Setlist queue yet) |
| Q-P2-2 | Custom chrome over HTML5 `<audio>`; no new API/aggregate |
| Q-P2-3 | Track selector: all playable `audio` then `click` Resources |
| Q-P2-4 | localStorage: volume + last Resource id (per Group/Arrangement) |
| Q-P2-5 | Manual lyric/ChordPro scroll; no time-sync marks |
| Q-P2-6 | Spanish chrome; Playwright TC-PLAY-01 |

---

## Scope

| In | Out |
| -- | --- |
| Practice player bar: play/pause, seek, time, volume | Pitch, YouTube, realtime |
| Multi-track Resource picker | Stems mixer, raising 5 MiB |
| localStorage prefs | Server-side player state |
| TC-PLAY-01 | Wave 3 queue (T-PLAY-06–08) |

---

## Tickets (Wave 2)

| ID | Work |
| -- | ---- |
| T-PLAY-01 | Player chrome: play/pause, seek, current/duration, volume |
| T-PLAY-02 | Track selector among playable `audio`/`click` Resources |
| T-PLAY-03 | Keep ChordPro/lyrics panel; manual scroll only |
| T-PLAY-04 | localStorage volume + last track |
| T-PLAY-05 | Playwright TC-PLAY-01 + keep full e2e green |

Ship **one PR** `feature/t-play-arrangement` → `develop`.

Wave 3 (separate PR after Wave 2 merge): T-PLAY-06–08 per ADR-0029 §6.

---

## Audit checklist

- [ ] No realtime / pitch / YouTube  
- [ ] No new aggregates / migrations  
- [ ] Spanish player chrome  
- [ ] TC-PLAY-01 + full Playwright green  
- [ ] No Cursor trailers  
