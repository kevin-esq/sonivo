# DESIGN.md — Sonivo redesign visual world

Replacement visual direction per ADR-0043 (PROPOSED). Current evidence: dark-only shell (`web/sonivo-web/src/index.css`), sidebar + bottom-tab `GroupWorkspace.tsx`, currentColor `SonivoMark`.

---

## Concept

**Apple Music immersive × Supabase precise.** Immersive group headers (cover, ambient accent wash, display type) for identity and Operate focus; dense, disciplined tables/forms/empty-states for Listas, Setlists, Eventos, Personas.

---

## Tokens

| Token | Light | Dark |
| ----- | ----- | ---- |
| Surface base | `#F8FAFC` (neutral-light) | `#0B1220` (canvas, current) |
| Surface raised | `#FFFFFF` | `#0F172A` (neutral-dark, current sidebar) |
| Text | `#0F172A` | `#F8FAFC` |
| Muted text | `#64748B` | `#94A3B8` (replaces ad-hoc slate-400) |
| Border | `#E2E8F0` | `rgba(255,255,255,0.10)` (current) |
| Primary | `#8366F1` both | Secondary `#E8C4F6` · success `#7DDB81` · warning `#F3B626` · error `#EF4444` (all current) |

**Per-group accent (Owner-only, optional):** defaults to primary `#8366F1`; group may set accent + cover + logo in Ajustes grupo onboarding. Accent drives header wash, active nav, focus rings, player glow. SonivoMark inherits via currentColor.

---

## Typography

**Plus Jakarta Sans** everywhere (already `--font-sans`): display 28–34 semibold tight for immersive headers; 15–16 body; 12–13 muted labels/captions. No second family.

## Radius / elevation

`--radius-md 0.75rem` cards · `--radius-lg 1rem` sheets/dialogs · `--radius-xl 1.25rem` immersive headers (all current). Light adds soft shadow; dark keeps current border-on-flat.

## Motion

**220ms** `cubic-bezier(0.22,1,0.36,1)` enter (current `library-enter`: fade + 8px rise) as the single standard; `prefers-reduced-motion` collapses to ~0ms (already in `index.css`, must cover all new animation).

---

## Patterns

- **Immersive header:** cover/accent wash → group name (display) → role + next-event strip → section tabs. Replaces flat sidebar title block.
- **Operate tables/forms:** sticky header row, row hover, inline status chips (ready/missing/tombstone), explicit empty states with one primary action.
- **PersistentGlobalPlayer:** fixed bottom bar (above mobile tabs), accent glow on play, aria-live track/position announcements; never unmounts on route change.
- **Nav:** app sidebar for signed-in non-group routes (Inicio · Mis grupos · Unirse · Cuenta) · group workspace rail (Grupo sections + Cuenta footer) · mobile bottom tabs/drawer. `/` is the Inicio dashboard (ADR-0053); the group list lives at `/grupos`.

---

## A11y floor (non-negotiable)

- Visible `focus-visible` rings (accent, 2px + offset) on every interactive element — current NavLink pattern becomes global.
- `aria-live` for player position, RSVP saves, 409 conflict UX; `role="alert"` for errors (current patterns kept).
- Contrast: AA for body text both themes; muted text never the sole carrier of status (pair with icon/label).
- Touch targets ≥ 44px on mobile tabs and player controls.

---

## Out of scope

No brand-mark change · no new font · no backend-driven theming · no per-song themes · no motion beyond the 220ms standard without its own ADR.
