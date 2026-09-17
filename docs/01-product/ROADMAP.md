# ROADMAP.md — Sonivo

Product sequencing.

**Phase 0–3.1 CLOSED.**  
**Phase 3.2 approved scope COMPLETED** — `Song → Arrangement → Link Resource` + React Library Shell + sparse Playwright E2E (T-3.2.01–05, 07, 08) on `develop`.  
**Phase 3.3 thin S2 COMPLETED** — Setlist → Event apply → React UI → Playwright (T-3.3.01–05) on `develop` (PR [#6](https://github.com/kevin-esq/sonivo/pull/6)).  
**Phase 3.4 thin invites COMPLETED** — T-3.4.01–03 on `develop` (PR [#8](https://github.com/kevin-esq/sonivo/pull/8)).  
**Phase 3.5 thin RSVP COMPLETED** — T-3.5.01–03 on `develop` (PR [#10](https://github.com/kevin-esq/sonivo/pull/10)). Spec: [`PHASE-3.5-RSVP-SPEC.md`](../03-architecture/PHASE-3.5-RSVP-SPEC.md).  
**Phase 3.6 thin Event PATCH/cancel AUTHORIZED** (not started) — T-3.6.01–03. Spec: [`PHASE-3.6-EVENT-SPEC.md`](../03-architecture/PHASE-3.6-EVENT-SPEC.md).  
**Deferred:** T-3.2.06 file Resource / blob / content; SMTP. Do not merge to `main`.  
**Next:** Phase 3.6 T-3.6.01 (Event PATCH + cancel Application + API).

Product/code features beyond authorized tickets require **explicit** human approval.

---

## Phases

### Phase 0–3.1 (CLOSED)

- [x] ADRs 0001–0025; Group slice; Compose; CI/Playwright; Resource domain (0024); Song/Arrangement domain (0025)

### Phase 3.2 — Repertoire (approved scope COMPLETED)

Approved slice: **Song → Arrangement → Link Resource** (backend + React library + sparse E2E). Not the full repertoire roadmap (file Resource, Event/Setlist/RSVP remain outside this closed scope).

- [x] Spec [`PHASE-3.2-REPERTOIRE-SPEC.md`](../03-architecture/PHASE-3.2-REPERTOIRE-SPEC.md) + docs sync (nested Resource routes, PATCH semantics)
- [x] T-3.2.01 Schema alignment migration
- [x] T-3.2.02 Song CRUD
- [x] T-3.2.04 Arrangement CRUD
- [x] T-3.2.03 Song soft-delete cascade
- [x] T-3.2.05 Link Resource CRUD (nested routes)
- [x] T-3.2.07 React library shell (Song / Arrangement / Link Resource UI; Owner/Member gating; expectedVersion conflict UX; no file/blob)
- [x] T-3.2.08 Playwright library journey (TC-LIB-01/02/03; Member browser E2E and 409 E2E deferred)
- [ ] T-3.2.06 File Resource / blob / content — **DEFERRED** (Q-R1/Q-R2); not automatic next
- [ ] Optional: confirm Q-R3 max lengths

### Phase 3.3 — Thin S2 scheduling (COMPLETED)

Setlist → Event apply → copied Event Plan + React UI + sparse Playwright. RSVP / Event cancel remain outside this closed scope.

- [x] Spec [`PHASE-3.3-THIN-SPEC.md`](../03-architecture/PHASE-3.3-THIN-SPEC.md)
- [x] T-3.3.01 Setlist Application + API
- [x] T-3.3.02 Event Application + API
- [x] T-3.3.03 Apply Setlist → Event Plan
- [x] T-3.3.04 React Setlist + Event + Apply UI
- [x] T-3.3.05 Sparse Playwright (TC-EVT-01/02)

### Phase 3.4 — Thin invites (COMPLETED)

Link token, no email. Spec: [`PHASE-3.4-INVITE-SPEC.md`](../03-architecture/PHASE-3.4-INVITE-SPEC.md). Shipped on `develop` (PR [#8](https://github.com/kevin-esq/sonivo/pull/8)).

- [x] T-3.4.01 Invitation Application + API + migration
- [x] T-3.4.02 React invite + join UI
- [x] T-3.4.03 Sparse Playwright Member join + read plan (TC-INV-01)

### Phase 3.5 — Thin RSVP (COMPLETED)

Yes / no / maybe on a dated Event. Spec: [`PHASE-3.5-RSVP-SPEC.md`](../03-architecture/PHASE-3.5-RSVP-SPEC.md). Shipped on `develop` (PR [#10](https://github.com/kevin-esq/sonivo/pull/10)).

- [x] T-3.5.01 RSVP Application + API
- [x] T-3.5.02 React Event Attendance UI
- [x] T-3.5.03 Sparse Playwright Member RSVP (TC-RSVP-01)

### Phase 3.6 — Thin Event PATCH + cancel (AUTHORIZED, not started)

Owner corrects title / type / startsAt and cancels (soft-hide). Spec: [`PHASE-3.6-EVENT-SPEC.md`](../03-architecture/PHASE-3.6-EVENT-SPEC.md). T-3.2.06 and SMTP remain deferred. No merge to `main`.

- [ ] T-3.6.01 Event PATCH + cancel Application + API
- [ ] T-3.6.02 React Event edit + Cancel event UI
- [ ] T-3.6.03 Sparse Playwright (TC-EVT-03)

### Later (only when authorized)

- File Resource / blob storage (T-3.2.06)  
- Email invites  

---

## Canonical journey

**Prepare the next musical event** → EventSetlistItems (copied labels + overrides) → Member materials (live Arrangement Resources) + RSVP → repeat.

---

## Remaining OPEN

Q8 chart format · Q9 realtime · Q10 billing · Q11 mobile/PWA · account deletion · hosting · invite mechanics thin freeze **Q-I1–I8** (email invites **FUTURE**) · blob vendor · session TTLs · **Q-R1/Q-R2 file Resource (deferred)** · **Q-R3 max lengths** (provisional OK for link slice)
