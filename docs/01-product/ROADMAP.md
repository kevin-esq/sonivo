# ROADMAP.md — Sonivo

Product sequencing.

**Phase 0–3.1 CLOSED.**  
**Phase 3.2 backend** (`Song → Arrangement → Link Resource`, T-3.2.01–05) — **COMPLETE**. Docs synced to nested Resource routes.  
**Next:** T-3.2.07 React library shell (requires explicit authorization). T-3.2.06 file Resource **DEFERRED**. T-3.2.08 Playwright after T-3.2.07.

Product/code features beyond authorized tickets require **explicit** human approval.

---

## Phases

### Phase 0–3.1 (CLOSED)

- [x] ADRs 0001–0025; Group slice; Compose; CI/Playwright; Resource domain (0024); Song/Arrangement domain (0025)

### Phase 3.2 — Repertoire (backend COMPLETE; UI next)

- [x] Spec [`PHASE-3.2-REPERTOIRE-SPEC.md`](../03-architecture/PHASE-3.2-REPERTOIRE-SPEC.md) + docs sync (nested Resource routes, PATCH semantics)
- [x] T-3.2.01 Schema alignment migration
- [x] T-3.2.02 Song CRUD
- [x] T-3.2.04 Arrangement CRUD
- [x] T-3.2.03 Song soft-delete cascade
- [x] T-3.2.05 Link Resource CRUD (nested routes)
- [ ] **T-3.2.07** React library shell — next implementation ticket
- [ ] T-3.2.08 Playwright library journey (after T-3.2.07)
- [ ] T-3.2.06 File Resource / blob / content — **DEFERRED** (Q-R1/Q-R2)
- [ ] Optional: confirm Q-R3 max lengths

### Later (only when authorized)

- File Resource / blob storage (T-3.2.06)  
- Event / Setlist / RSVP spine continuation  

---

## Canonical journey

**Prepare the next musical event** → EventSetlistItems (copied labels + overrides) → Member materials (live Arrangement Resources) + RSVP → repeat.

---

## Remaining OPEN

Q8 chart format · Q9 realtime · Q10 billing · Q11 mobile/PWA · account deletion · hosting · invite mechanics · blob vendor · session TTLs · **Q-R1/Q-R2 file Resource (deferred)** · **Q-R3 max lengths** (provisional OK for link slice)
