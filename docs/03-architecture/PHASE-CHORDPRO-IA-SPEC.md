# Phase ChordPro + assisted tooling (ADR-0030)

**Status:** Wave P0–P2 **COMPLETE** 2026-09-18 (T-C30-01–05, 10–12, 20–22). ADR-0030 **ACCEPTED**.  
**Product bet:** Ensayo en otro tono + digitalizar letra/acordes + sembrar canción estructurada — sin Whisper/LLM cloud en este thin.  
**Date:** 2026-09-18  
**Depends on:** ADR-0030, 0028, 0029.

---

## Frozen mechanics

| ID | Decision |
| -- | -------- |
| Q-C30-1 | Truth = `Arrangement.Chords` ChordPro text |
| Q-C30-2 | P0 client transpose ±N semitones; Owner may save |
| Q-C30-3 | P0 Practice view modes in localStorage (hide chords / show chords) |
| Q-C30-4 | P1 text digitizer = deterministic placer + edit studio (no cloud LLM) |
| Q-C30-5 | P2 compose = Owner-only templates/rules (no cloud LLM) |
| Q-C30-6 | Out: Whisper, cloud LLM, audio digitizer, Q9, pitch, YouTube |
| Q-C30-7 | Spanish UI; ship P0 → P1 → P2 as separate PRs |

---

## P0 — Transposición + vistas (ship first)

| ID | Work |
| -- | ---- |
| T-C30-01 | `transposeChordPro(text, semitones)` pure helper (preserve lyrics/directives) |
| T-C30-02 | Practice: Tono −1 / +1 / reset preview; show effective key hint |
| T-C30-03 | Practice: vista Cantante (ocultar acordes) / Guitarrista (mostrar); localStorage |
| T-C30-04 | Owner: Guardar tono → PATCH chords (+ defaultKey when sensible) |
| T-C30-05 | Playwright TC-C30-01: ChordPro → Practicar → +1 muestra acorde traspuesto |

Branch: `feature/t-c30-transpose-views`

---

## P1 — Digitalizador texto

| ID | Work |
| -- | ---- |
| T-C30-10 | Owner UI: pegar letra + lista de acordes → generar ChordPro en campo Chords |
| T-C30-11 | Estudio: seleccionar acorde y mover una sílaba/palabra (←/→ o clic) |
| T-C30-12 | Playwright TC-C30-02: digitizer → Practicar ve chord+lyric |

Branch: `feature/t-c30-digitizer-text`

---

## P2 — Asistente composición

| ID | Work |
| -- | ---- |
| T-C30-20 | Owner UI: género, tonalidad, idea → ChordPro con verse/chorus directives |
| T-C30-21 | Acciones: variar progresión; reescribir una sección (template swap) |
| T-C30-22 | Playwright TC-C30-03: compose → campo Chords contiene `{start_of_chorus}` o equivalente |

Branch: `feature/t-c30-compose-assist`

---

## Audit checklist (each PR)

- [x] No Whisper / cloud LLM / Q9 / pitch / YouTube  
- [x] No new aggregates / migrations  
- [x] Spanish copy  
- [x] Named Playwright TC + full suite green  
- [x] No Cursor trailers  
