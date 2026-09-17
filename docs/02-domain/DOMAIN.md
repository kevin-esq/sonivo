# DOMAIN.md — Sonivo

Strategic domain boundaries.

**Model:** [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) · **Glossary:** [`../00-context/GLOSSARY.md`](../00-context/GLOSSARY.md)

**Status:** ACCEPTED ADRs 0005–0025.

---

## Value

**Prepare the next musical event** — shared plan on Event, current materials via Arrangement, RSVP. Setlist templates accelerate reuse.

**Song** = catalog work identity. **Arrangement** = performable realization (body + Resources). Rehearsal materials follow ADR-0024.

---

## Spine

Group → Membership → Song → Arrangement (+ Resource) → optional Setlist template → SetlistItem → Event → EventSetlistItem → RSVP

---

## Historical identity

Event history uses **tombstone identity** (copied song title + arrangement label), not content snapshots (ADR-0018). Resource availability on past Events remains **NOT GUARANTEED**. EventSetlistItem does **not** reference Resources (ADR-0024).

---

## Naming

Use **Group**. No Workspace/Organization in MVP.  
**Part** is Resource metadata only (ADR-0024).  
Song/Arrangement fields, no `IsDefault`, Song soft-delete cascade + concurrency: **ADR-0025 ACCEPTED**.
