# CONTEXT.md — Sonivo

Durable high-level project context.

**Last updated:** 2026-09-17 (Phase 3.7 People COMPLETED; Gate A continues with 3.8; live on Render from `develop`)  
**Phase:** Phase 0–3.1 **CLOSED**. Phase 3.2–3.7 **COMPLETED** (3.7 pending merge to `develop` on `feature/phase-3.7-people`). Live host pack on `develop` (https://sonivo.onrender.com). T-3.2.06 file Resource **DEFERRED**. SMTP **DEFERRED**. **Do not merge `main` until Gate B** ([`SYSTEM-CLOSE-PLAN.md`](../01-product/SYSTEM-CLOSE-PLAN.md)): Gate A = functional loop (invite hygiene next); Gate B = UI redesign then `main`.  
**Repo:** Modular monolith + Group + repertoire API + library UI + docs

---

## How to read this file

| Label | Meaning |
| ----- | ------- |
| **FACT** | Confirmed product or engineering decision |
| **ASSUMPTION** | Believed but not validated |
| **OPEN QUESTION** | Requires an explicit decision |
| **PROHIBITION** | Explicitly out of scope or forbidden |
| **FUTURE** | Possible later; must not drive current build |

Glossary: [`GLOSSARY.md`](GLOSSARY.md) · ADRs: [`../03-architecture/DECISIONS.md`](../03-architecture/DECISIONS.md) · Model: [`../02-domain/DOMAIN-MODEL.md`](../02-domain/DOMAIN-MODEL.md)

---

## One-liner

**FACT:** Sonivo is a SaaS organizational layer for musical groups and musical projects: music, people, rehearsals, performances, and project coordination in one place — without replacing DAWs or distributors.

**Core job:** Keep a musical group’s shared repertoire, people, and upcoming performances organized so everyone works from the same current materials.

**Recurring loop (FACT — ADR-0015–0018):** **Prepare the next musical event.**

---

## FACTS

### Product

1. Product name is **Sonivo**.
2. Multi-segment positioning; worship supported, not defining (ADR-0001).
3. Value proposition: **Your music. Your people. Your projects. One organized place.**
4. Primary persona: Group Organizer; secondary: Member; Guest not required (ADR-0006).
5. Member read/use UX must be first-class (ADR-0006).
6. Organizer → Owner; Member persona → Member role (ADR-0012).
7. MVP value = library-anchored coordination, not song CRUD (ADR-0015–0017).

### Domain / tenancy (0005–0014 + Phase 1 package)

8. **Group** is MVP tenant; multi-Group Users; no Workspace/Organization (ADR-0005).  
9. Roles **Owner** \| **Member** only (ADR-0012).  
10. Multi-owner lifecycle; soft-delete Group (ADR-0013).  
11. Song = identity; Arrangement = playable aggregate; Resources on Arrangement (ADR-0007, 0008, 0014).  
12. Song may have zero Arrangements (ADR-0017). Song create does **not** require an Arrangement (**ADR-0025 ACCEPTED**).  
13. Resource purpose: `chart`\|`lyrics`\|`audio`\|`click`\|`reference`\|`practice`\|`other`; required Label; optional free-text Part (ADR-0017 revised by **ADR-0024 ACCEPTED**).  
13a. Song Title duplicates ALLOWED; Attribution free text; OriginKind `original`\|`cover`\|`other`; Arrangement Label required; no `IsDefault`; Key free text; BPM optional int 1–400; lyrics/chords/structure/notes plain text; Song soft-delete cascades live Arr soft-delete with Song `expectedVersion` / one tx / 409 on conflict (**ADR-0025 ACCEPTED**).  
14. Setlist = reusable template; apply = copy to EventSetlistItems; `sourceSetlistId` provenance only (ADR-0016, 0017).  
15. Duplicate Arrangement appearances ALLOWED (ADR-0016).  
16. Event types: `rehearsal`\|`performance`\|`other`; cancel + soft-hide (ADR-0016).  
17. EventSetlistItem: ArrangementId + copied display labels + order + overrides; tombstones not content snapshots (ADR-0018).  
18. Historical contract: plan/RSVP/labels MUST stable; Arrangement body & Resources NOT GUARANTEED (ADR-0016–0018).  
19. Deletes: soft Group/Song/Arrangement; hard Resource & Setlist template; Event cancel+soft-hide (ADR-0016–0017).

### Engineering

20. Stack/auth/session per ADR-0009–0011; modular monolith; no microservices/CQRS/ES.  
21. Tooling ADR-0002 ACCEPTED; Phase 0 CLOSED.  
22. Application foundation (Phase 2.3) + Group slice + Phase 3.2 approved repertoire slice + Phase 3.3 thin S2 (Setlist → Event apply + UI + E2E) + Phase 3.4 thin invites (link token, no email; PR [#8](https://github.com/kevin-esq/sonivo/pull/8), merge `8db0714`) + Phase 3.5 thin RSVP (T-3.5.01–03; PR [#10](https://github.com/kevin-esq/sonivo/pull/10), merge `cbc8824`) + Phase 3.6 Event PATCH/cancel (T-3.6.01–03) + Phase 3.7 People (T-3.7.01–03) exist. File Resource (T-3.2.06) remains **DEFERRED**. SMTP remains **DEFERRED**.  
23. Phase 2 technical docs under `docs/03-architecture/` (ARCHITECTURE, TECHNICAL-SPEC, API, SECURITY, TESTING, PERSISTENCE).  
24. ADR-0019–0021 **ACCEPTED** — Phase 2.1.  
25. ADR-0022–0023 **ACCEPTED** — Phase 2.2; integer `Version` concurrency ACCEPTED.  
26. Phase 2.3 foundation: `Sonivo.slnx`, Domain/Application/Infrastructure/Api, React web shell, initial EF migration `InitialFoundation`.  
27. Phase 3.0–3.0.2.1 CLOSED (Group slice; Compose Postgres; CI/Playwright; public repo audit).  
28. Phase 3.0.3 **CLOSED** — ADR-0024 **ACCEPTED** (practice Resources / Part metadata).  
29. Phase 3.1 **CLOSED** — ADR-0025 **ACCEPTED**.  
30. Phase 3.2 approved scope **COMPLETED** (T-3.2.01–05, 07, 08): Song / Arrangement / **Link** Resource with **nested** Resource routes; migration `AlignRepertoireToAdr0024And0025`; React Library Shell (Owner mutate / Member read UX, expectedVersion conflict UX); sparse Playwright TC-LIB-01/02/03 (Member browser E2E and 409 E2E deferred). File Resource / blob / `IBlobStore` / upload / content (**T-3.2.06**) remains **DEFERRED**. Phase 3.3 thin S2 **COMPLETED** on `develop` (T-3.3.01–05, PR #6 / `80f5f63`): Setlist → Event apply → React UI → Playwright (TC-EVT-01/02). Phase 3.4 thin invites **COMPLETED** on `develop` (T-3.4.01–03, PR #8 / `8db0714`): link token, no email. Phase 3.5 thin RSVP **COMPLETED** on `develop` (T-3.5.01–03, PR [#10](https://github.com/kevin-esq/sonivo/pull/10) / `cbc8824`) per [`PHASE-3.5-RSVP-SPEC.md`](../03-architecture/PHASE-3.5-RSVP-SPEC.md): Event `yes`/`no`/`maybe` upsert + Attendance UI + TC-RSVP-01. Phase 3.6 thin Event PATCH/cancel **COMPLETED** (T-3.6.01–03) per [`PHASE-3.6-EVENT-SPEC.md`](../03-architecture/PHASE-3.6-EVENT-SPEC.md): Owner title/type/startsAt PATCH + cancel/soft-hide + TC-EVT-03. Phase 3.7 thin People **COMPLETED** (T-3.7.01–03) per [`PHASE-3.7-PEOPLE-SPEC.md`](../03-architecture/PHASE-3.7-PEOPLE-SPEC.md): members list/remove/role/leave + People UI + Group rename/soft-delete + TC-PPL-01. SMTP remains **DEFERRED**. No merge to `main`.

---

## ASSUMPTIONS

1. Responsive web; organizer desktop-first; member mobile-usable.  
2. English-first UI.  
3. Song create does not require an Arrangement (ADR-0025); optional convenience “Song + initial Arrangement” use-case only.  
4. Progressive UI may hide Arrangement chrome when only one Arrangement exists (**count-based**, not `IsDefault` — ADR-0025).  
5. Soft-delete + later blob GC acceptable.  
6. Soft-deleting a Song soft-deletes its **live** Arrangements in the same Application transaction (ADR-0025); SetlistItems remain; Event history uses copied labels.

---

## OPEN QUESTIONS

| ID | Question |
| -- | -------- |
| **Q8** | Chart format |
| **Q9** | Realtime (lean no) |
| **Q10** | Billing |
| **Q11** | Native mobile / PWA |
| — | Hosting · account-deletion product |
| — | Invite mechanics: thin 3.4 freeze **Q-I1–I8** ([`PHASE-3.4-INVITE-SPEC.md`](../03-architecture/PHASE-3.4-INVITE-SPEC.md)); email invites remain **FUTURE** |
| — | Blob vendor · exact session TTLs · upload size caps |

---

## PROHIBITIONS

1. Church-only / DAW / streaming / social / distributor / church-CMS.  
2. Implement/scaffold/install without explicit approval.  
3. Workspace/Organization; Recording/Performance aggregates in MVP.  
4. Organizer/Guest roles; ACL engines; JWT web; BFF; Supabase Auth.  
5. Silently reopen ACCEPTED ADRs 0001–0025 without a superseding ADR.  
6. Content versioning / DAM / Event body snapshots in MVP.  
7. Unauthorized user-global tooling as Sonivo dependency.

---

## FUTURE

Organization · Event resources · Member edits · albums · live tools · social login · mobile bearer · blob GC · account deletion · email invites · ChordPro · realtime · billing · duration/transitions · Arrangement status · Resource soft-delete undo

---

## Change protocol

1. Material decisions → ADR → update FACTS when ACCEPTED.  
2. Glossary ↔ domain docs together.  
3. Phase 1 package (0015–0018) and Phase 2.1–2.2 packages (0019–0023) are **CLOSED** — do not reopen without superseding ADR.
