# Phase UX journeys — Practice / Event daily use (Wave 4)

**Status:** Wave 4 **COMPLETE** 2026-09-17 (T-UX-10–32; PR #62). No new ADR (Gate B chrome closed; Practice/Player surfaces from ADR-0027–0029).  
**Product bet:** Daily rehearsal path feels ready — empty states, loading, mobile Practice/Player, Member next-event, copy clean.  
**Date:** 2026-09-17  
**Depends on:** Gate B UI; ADR-0027–0029; Wave 1–3 complete.

---

## Frozen mechanics

| ID | Decision |
| -- | -------- |
| Q-U4-1 | Polish **existing** routes only — no new product features beyond listed tickets |
| Q-U4-2 | Spanish copy; no Spanglish |
| Q-U4-3 | Prefer shared chrome (`EmptyPanel`, skeletons) already in repertoire |
| Q-U4-4 | Do **not** reopen Gate B global redesign |
| Q-U4-5 | Playwright: sparse TC-UX-01 smoke (Owner empty→CTA or Member next-event path) + full suite green |

---

## Scope

| In | Out |
| -- | --- |
| Empty states + next-step CTAs on Group home / Library / Events | New aggregates / APIs |
| Skeleton/loading on Practice + Player | Realtime, pitch, YouTube |
| Clearer file-upload MIME/error Spanish | S3 / raise 5 MiB |
| Mobile-usable Practice + queue chrome | Full visual redesign |
| Member home: próximo evento + RSVP hint + materials link | Organization entity |
| 2-tap path Event plan → Practicar | Event notification mail |
| Copy audit on Practice/Player/Event plan | Impeccable full redesign |

---

## Tickets

| ID | Work |
| -- | ---- |
| T-UX-10 | Empty states + next-step CTAs (Inicio → Biblioteca → Lista → Evento) where missing |
| T-UX-11 | Skeleton/loading consistent on Practice / Player / queue |
| T-UX-12 | File upload feedback (progress or pending state + clear Spanish MIME/size errors) |
| T-UX-13 | Mobile: Practice + player + queue usable one-handed (touch targets, wrap) |
| T-UX-20 | Member Group home: próximo evento + mi RSVP + link materiales/plan |
| T-UX-21 | Ensure ≤2 taps from Event plan to Practicar (Ensayar plan already helps — verify Member) |
| T-UX-22 | Copy pass: Practice / Player / queue / Ensayar plan Spanish |
| T-UX-30 | Typography/spacing polish on Practice + Player only (tokens already in Gate B) |
| T-UX-31 | List density tweak Biblioteca / Listas / Eventos (subtle, not redesign) |
| T-UX-32 | A11y: focus, labels, contrast on player + queue controls |

Ship **one PR** `feature/t-ux-journeys` → `develop` (batch OK — one coherent UX slice).

---

## Audit checklist

- [x] No Gate B reopen / purple-slop / new deps beyond allowlist  
- [x] No realtime / pitch / YouTube / Event mail  
- [x] Spanish only on touched surfaces  
- [x] Full Playwright green (+ optional TC-UX-01)  
- [x] No Cursor trailers  
