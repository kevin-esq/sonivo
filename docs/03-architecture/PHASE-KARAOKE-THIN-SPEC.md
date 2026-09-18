# Phase Thin Practice / Karaoke view

**Status:** AUTHORIZED 2026-09-17 (Kevin Esquivel — “Acepto todo”). ADR-0027 **ACCEPTED**.  
**Product bet:** Members can **Practicar** an Arrangement — lyrics + optional audio — without a live-tools platform.  
**Date:** 2026-09-17  
**Depends on:** ADR-0027; Arrangement + Resource (link/file) already shipped.

---

## Frozen mechanics

| ID | Decision |
| -- | -------- |
| Q-K1 | Read-only Practice page; Member + Owner |
| Q-K2 | Show Title, Label, Lyrics, Key, Tempo |
| Q-K3 | One `<audio>` from best Resource: prefer `audio` then `click`; file via content URL or link URL |
| Q-K4 | No new tables / no realtime / no pitch / no ChordPro |
| Q-K5 | Spanish: “Practicar”, “Letra”, “Reproducir” |
| Q-K6 | Playwright TC-PRACTICE-01: create song with lyrics → open Practicar → see lyrics text |

---

## Scope

| In | Out |
| -- | --- |
| React Practice route + nav from Arrangement | WebSockets, conductor, Event karaoke |
| Reuse API GET arrangement/resources/content | New backend endpoints (unless a tiny content URL helper is needed) |
| Sparse Playwright | Pitch, YouTube, multi-track |

---

## Tickets

| ID | Work |
| -- | ---- |
| T-KARAOKE-01 | ADR-0027 already in DECISIONS — Practice UI + audio pick |
| T-KARAOKE-02 | Playwright TC-PRACTICE-01 |

One PR: `feature/t-karaoke-thin` → `develop`.

---

## Audit checklist

- [ ] No realtime / no new aggregates  
- [ ] AuthZ unchanged (Member can open)  
- [ ] Spanish copy  
- [ ] Existing Playwright suite still green  
- [ ] No Cursor trailers  
