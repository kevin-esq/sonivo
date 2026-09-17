# ROADMAP.md — Sonivo

Product sequencing.

**Phase 0–2.2 CLOSED** (docs/ADRs through 0023).  
**Phase 2.3 CLOSED** (scaffold & foundation).  
Product features require **explicit** human approval.

---

## Phases

### Phase 0 (CLOSED)

- [x] ADRs 0001–0014, tooling 0002

### Phase 1 — Product & domain (CLOSED)

- [x] 1.0–1.3 challenge passes  
- [x] HUMAN ACCEPT ADR-0015, 0016, 0017, 0018  

### Phase 2 — Technical specification (CLOSED through 2.2)

- [x] 2.0 architecture / API / security / testing package  
- [x] 2.1 HUMAN ACCEPT ADR-0019, 0020, 0021  
- [x] 2.2 HUMAN ACCEPT persistence + ADR-0022, 0023 (+ Version concurrency)  

### Phase 2.3 — Scaffold & foundation (CLOSED)

- [x] .NET modular monolith solution  
- [x] EF Core + Identity + cookie + antiforgery foundation  
- [x] Initial migration `InitialFoundation`  
- [x] React/Vite/TS/Tailwind shell + Vite `/api` proxy  
- [x] Test projects green  

### Later (only when authorized)

- First vertical product feature (Group/library/Event spine) via TDD  
- Spec / tickets → implementation  

---

## Canonical journey

**Prepare the next musical event** → EventSetlistItems (copied labels + overrides) → Member materials (live) + RSVP → repeat.

---

## Remaining OPEN

Q8 chart format · Q9 realtime · Q10 billing · Q11 mobile/PWA · account deletion · hosting · invite mechanics · blob vendor · session TTLs · upload size caps
