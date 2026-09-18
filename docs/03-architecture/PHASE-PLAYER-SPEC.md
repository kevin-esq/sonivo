# Phase Player — Practice audio (ADR-0029)

**Status:** Wave 2 **COMPLETE** 2026-09-17 (T-PLAY-01–05; PR #54). Wave 3 **COMPLETE** 2026-09-17 (T-PLAY-06–08). ADR-0029 **ACCEPTED**.  
**Product bet:** Musicians rehearse with seek/volume/track choice while reading ChordPro/lyrics — without realtime. Event/Setlist queue next.  
**Date:** 2026-09-17  
**Depends on:** ADR-0029, 0027, 0028; T-3.2.06; Phase 3.3 Event plan.

---

## Frozen mechanics (Wave 2 — DONE)

| ID | Decision |
| -- | -------- |
| Q-P2-1 | Arrangement-scoped Practice player only in Wave 2 (no Event/Setlist queue yet) |
| Q-P2-2 | Custom chrome over HTML5 `<audio>`; no new API/aggregate |
| Q-P2-3 | Track selector: all playable `audio` then `click` Resources |
| Q-P2-4 | localStorage: volume + last Resource id (per Group/Arrangement) |
| Q-P2-5 | Manual lyric/ChordPro scroll; no time-sync marks |
| Q-P2-6 | Spanish chrome; Playwright TC-PLAY-01 |

## Frozen mechanics (Wave 3 — DONE)

| ID | Decision |
| -- | -------- |
| Q-P3-1 | Queue from Event plan items (ordered Arrangements after apply-setlist) |
| Q-P3-2 | next/prev in SPA; show song title / arrangement label per item |
| Q-P3-3 | Jump opens/navigates that Arrangement’s Practice (reuse Wave 2 chrome) |
| Q-P3-4 | No new aggregates; reuse Event GET plan + existing Practice route |
| Q-P3-5 | Spanish UI; Playwright TC-PLAY-02 |
| Q-P3-6 | Entry: Event **Ensayar plan** → Practice `?eventId=` + `item=` (SPA-only) |

---

## Scope Wave 3

| In | Out |
| -- | --- |
| Event page (or Practice-with-queue) next/prev over plan items | Realtime, pitch, YouTube |
| Title/label per queue item | Auto-advance audio end → next (optional thin: button-only OK) |
| Link/navigate to Arrangement Practice | Server playlist persistence |
| TC-PLAY-02 | Raising 5 MiB / S3 |

---

## Tickets (Wave 2 — DONE)

| ID | Work |
| -- | ---- |
| T-PLAY-01…05 | COMPLETE (PR #54) |

## Tickets (Wave 3 — DONE)

| ID | Work |
| -- | ---- |
| T-PLAY-06 | Queue UI from Event plan order (Anterior / Siguiente) — COMPLETE |
| T-PLAY-07 | Show title/label; open Practice for current item via `?eventId=` — COMPLETE |
| T-PLAY-08 | Playwright TC-PLAY-02: apply setlist → Event queue → Siguiente — COMPLETE |

Ship **one PR** `feature/t-play-event-queue` → `develop`.

---

## Audit checklist (Wave 3)

- [x] No realtime / pitch / YouTube  
- [x] No new aggregates / migrations  
- [x] Spanish queue chrome  
- [x] TC-PLAY-02 + full Playwright green  
- [x] No Cursor trailers  
