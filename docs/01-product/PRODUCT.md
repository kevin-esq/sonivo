# PRODUCT.md — Sonivo

Product definition. Complements `docs/00-context/CONTEXT.md`.

**Status:** ACCEPTED ADRs 0001, 0005–0023. Phase 1–2.3 foundation **CLOSED**. Product features not started.
**Visual direction:** Not finalized.

Personas → [`PERSONAS.md`](PERSONAS.md) · Jobs → [`JTBD.md`](JTBD.md) · Sequencing → [`ROADMAP.md`](ROADMAP.md)

---

## One-sentence core job

**Keep a musical group’s shared repertoire, people, and upcoming performances organized so everyone works from the same current materials.**

**Recurring value:** **Prepare the next musical event** — plan Arrangements (order + overrides) on an Event with stable **identity labels**; Members open **current** materials when available; RSVP. Past Events remain readable after soft-deletes via tombstones (not full snapshots).---

## Vision

Sonivo is the **organizational home** for a musical group’s work: the songs they play, the people who play them, the rehearsals that prepare them, the performances that deliver them, and the projects that grow from them.

Beside DAWs (creation) and distributors (release), Sonivo answers:

> What are we playing, who’s involved, what’s ready, what’s next, and where are the resources?

---

## Problem

Groups scatter truth across chat, Drive, PDFs, and memory — wrong keys, stale charts, unclear gigs, unreachable folders.

Sonivo makes musical work **shared, current, and permissioned**.

**Why not generic PM?** Tasks and docs do not model Song vs Arrangement, setlist execution, or arrangement-scoped audio/charts.  
**Why not Drive?** Files without repertoire identity, roles, and setlist/event context.

---

## Value proposition

> **Your music. Your people. Your projects. One organized place.**

---

## Target market

**Not church-exclusive** (ADR-0001). Segments: bands, choirs, worship/music ministries (supported), ensembles, independent artists/collabs, producers with small teams, other organized musical groups.

---

## Personas (ACCEPTED ADR-0006, 0012)

| Persona | Role mapping |
| ------- | ------------ |
| **Group Organizer** | Typically **Owner** |
| **Member** | **Member** |
| **Guest** | Not required MVP |

Members get first-class **read/use** UX. Members do **not** mutate core musical content in MVP.

---

## Product principles

1. Organizational layer, not a DAW or distributor  
2. Multi-segment language (Group, Event, Song, Arrangement)  
3. Permissioned shared truth  
4. Progressive depth (hide Arrangement until needed)  
5. Domain before CRUD  
6. Human, musical UI — not AI-dashboard slop  
7. Docs and ADRs beat agent improvisation  

---

## MVP boundary (Phases 1.0–1.2)

### CORE

- Group tenancy; Membership Owner \| Member  
- Song + Arrangement (playable unit; Song may have zero Arrangements — ADR-0017)  
- Resources (`file`\|`link`) with **minimal** purpose enum: chart, lyrics, audio, click, reference, other  
- Event + EventSetlistItems (copied plan) + Member view + RSVP  
- Identity + cookie session; server AuthZ  

### SUPPORTING

- Setlist **templates** (reuse accelerator; Event can be hand-built)  
- Event types rehearsal\|performance\|other; cancel/soft-hide  
- Invites / settings  

### FUTURE

Organization · Guest · Event resources · Member edits · Arrangement status · duration/transitions · Resource soft-delete undo · Q8–Q11 · releases · account deletion · forensic chart/file history  

### OUT OF SCOPE (MVP)

DAM/versioning · chat/PM/CRM/payments · DAW/distribution/social · church CMS · ACL engines · microservices/CQRS/ES · live Event↔template join that rewrites history  

---

## Tempting scope explosions (explicitly resist)

| Temptation | Why resist |
| ---------- | ---------- |
| “Just add tasks/kanban” | Becomes Notion; loses music wedge |
| Polymorphic assets everywhere | Premature platform |
| Per-member chart editing + ACL | AuthZ explosion before library works |
| Full rights/licensing suite | Wrong product |
| Idea → release pipeline | Premature vertical |

---

## Product hypothesis

If a group can keep library, people, setlists, events, and arrangement files current in Sonivo, they prefer it over Drive + chat scatter.
