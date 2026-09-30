# PRODUCT.md — Sonivo

Product truth for the UI/UX redesign. Complements `docs/00-context/CONTEXT.md` and `docs/01-product/PRODUCT.md`.

**Status:** follows ADR-0043 (PROPOSED). Binding only for ACCEPTED ADRs.

---

## One-liner

**FACT:** Sonivo is the organizational home for a musical group's shared repertoire, people, and upcoming performances — without replacing DAWs or distributors.

**Core job:** keep everyone working from the same current materials.

**Recurring loop (FACT — ADR-0015–0018): prepare the next musical event** — plan Arrangements (order + overrides) on an Event with stable identity labels; Members open current materials; RSVP yes/no/maybe. Past Events stay readable via tombstones, not snapshots.

---

## Personas

| Persona | Role | Needs from the redesign |
| ------- | ---- | ----------------------- |
| **Organizer** | Owner | Fast Operate surfaces: build setlists, run events, manage people — Supabase-like precision. |
| **Member** | Member | First-class read/use UX on any device: current charts, audio, RSVP — Apple-like immersion. |
| Guest | n/a | Not required in MVP (ADR-0006). |

Members do **not** mutate core musical content in MVP.

---

## Operate mode

The redesign's organizing principle: every Grupo section answers **"what's next and is it ready?"**

- Listas / Setlists / Eventos show readiness at a glance (arrangement present, resources attached, RSVP in).
- Event view is the conductor surface: frozen plan + copied identity labels + position broadcast (Q9 thin, ADR-0036).
- PersistentGlobalPlayer stays bottom-docked so audio/reference never loses context while navigating.

---

## Language: es/en, frontend-only

- UI ships in **es (default)** and **en**, switchable in `/cuenta` preferencias, persisted locally (`sonivo:lang`; account-synced persistence is phase 2 with backend).
- Backend strings, validation messages, and mails are **phase 2** (separate ADR). No API changes in this redesign.

---

## Responsive now, native later

- Responsive web ships in the redesign (organizer desktop-first, member mobile-usable).
- Native mobile stays **FUTURE** (Q11). No mobile bearer, no PWA install scope in W0–W5.

---

## Brand

**SonivoMark retained:** 4-bar waveform mark (`web/sonivo-web/src/brand/SonivoMark.tsx`), currentColor-inherited, primary `#8366F1` default. Redesign re-skins everything around it — never replaces it.

---

## Non-goals (firewall restatement)

No scoring (ADR-0037) · no native app (Q11 FUTURE) · no backend i18n · no S3/5 MiB changes (ADR-0035) · no payments (ADR-0042) · no AuthZ/auth/session changes (ADR-0009–0012, 0019–0020).
