# Phase 3.3 Thin S2 Specification

**Status:** **COMPLETED** on `develop` (PR [#6](https://github.com/kevin-esq/sonivo/pull/6), merge `80f5f63`). T-3.3.01–05 shipped.  
**Product bet:** S2 — Setlist → Event apply → copied Event Plan.  
**Scope source:** [`.scratch/PHASE-3.3-THIN-SCOPE.md`](../../.scratch/PHASE-3.3-THIN-SCOPE.md)  
**Develop reference:** `80f5f63e9b3e86f4ade3bfa2a4fffd6eb9ec4e23`  
**Date:** 2026-09-16  
**Depends on:** ADR-0016–0018, ADR-0021–0023, ADR-0019–0020; Phase 3.2 Library (Song → Arrangement → Link Resource)

Accepted ADRs remain authoritative. This spec **narrows** the conceptual Setlist/Event surface in [`API.md`](API.md) for a thin first productization — it does **not** reopen those ADRs.

---

## Product Goal

Prove that an Owner can prepare the **next rehearsal/performance** by composing a reusable **Setlist** from live Library Arrangements, creating a dated **Event**, and **applying** the Setlist so Members can read a concrete **Event Plan** that stays historically independent of later Setlist edits (**copy-on-apply**, ADR-0021 / 0018).

---

## User Journey

```text
OWNER
  Library (existing Arrangements)
  → create Setlist (Name)
  → add live Arrangements (duplicates ALLOWED) → reorder → save (full item replace)
  → create Event (Title, Type, StartsAt)
  → Apply Setlist (confirmReplace if plan already has items)
  → view Event Plan (copied displaySongTitle / displayArrangementLabel)

  Optional check: edit Setlist → Event Plan unchanged until confirmed re-apply

MEMBER
  → list/open Setlists (read)
  → list/open Events + Event Plan (read)
  → no mutate controls
```

---

## Scope

| Area | In |
| ---- | -- |
| Setlist | Create, list, get, rename (Name), replace ordered items |
| Event | Create, list, get (scheduled); Title, Type, StartsAt |
| Apply | Replace Event Plan from Setlist (ADR-0021) |
| History | Copied labels; plan independent of Setlist after apply |
| AuthZ | Owner mutate / Member read; same 401/403/404 rules |
| UI | Setlist + Event + Apply screens; Member read-only gating |
| E2E | One sparse Owner Playwright journey |

---

## Explicit Non-Scope

RSVP · invitations · email · notifications · file/blob Resources · upload/`IBlobStore`/`content` · hand-built Event plans (`PUT .../events/{id}/items`) · plan/item overrides UX · Event cancel/soft-hide · Setlist hard-delete · Location/Notes fields in UI · Setlist Notes · search · pagination · drag-and-drop · Member writes · new roles · new FE state libraries · CQRS/ES/microservices · JWT/Supabase Auth · Event Resource snapshots · PracticeMaterial · Member→Part · new migrations (unless a real schema defect is found — none expected) · exhaustive E2E matrices · Member invite-seeded E2E

---

## Existing Foundations

| Asset | State | Ticket action |
| ----- | ----- | ------------- |
| `Setlist`, `SetlistItem` entities + EF config + tables | Present | **Reuse** — do not recreate |
| `Event`, `EventSetlistItem` entities + EF config + tables | Present | **Reuse** |
| Composite `(GroupId, ArrangementId)` FKs, no Arr navigation | Present | **Keep** |
| `DisplaySongTitle` / `DisplayArrangementLabel` | Present | **Populate on apply** |
| `SourceSetlistId` SET NULL | Present | **Set on apply** |
| `Version` concurrency tokens | Present | **Wire expectedVersion** |
| `Rsvp` table | Present | **Ignore** |
| Application handlers / API / UI for Scheduling | **Shipped** (T-3.3.01–05) | **Done** |
| Library Song/Arrangement APIs + UI | Shipped | **Reuse** as Arr source |

**Foundation vs ADR:** No conflict found. Persistence matches ADR-0018/0021–0023. No new ADR required.

**Ticket boundary note:** Schema/domain types already exist, so there is **no** “create Setlist/Event tables” ticket. T-3.3.01 starts at Application productization. Setlist **UI is not** split into an early ticket ahead of Event/Apply — all React work is T-3.3.04 (same pattern as Phase 3.2 library shell after backend). T-3.3.01 and T-3.3.02 may proceed in parallel.

---

## API Surface

All under `/api/groups/{groupId}`. CSRF on POST/PUT/PATCH/DELETE. Problem Details. Thin slice implements **only**:

### Setlist

| Method | Route | AuthZ | Notes |
| ------ | ----- | ----- | ----- |
| GET | `.../setlists` | Member | List |
| POST | `.../setlists` | Owner | Body: `{ name }` → 201 |
| GET | `.../setlists/{setlistId}` | Member | Detail + items (live Song Title + Arr Label for template UX) |
| PATCH | `.../setlists/{setlistId}` | Owner | `{ expectedVersion, name }` → 200 + new version |
| PUT | `.../setlists/{setlistId}/items` | Owner | Full ordered replace: `{ expectedVersion, items: [{ arrangementId, sortOrder }] }` · duplicates OK · soft-deleted Arr → **400/409** |

**Not in thin slice:** DELETE setlist; POST/PATCH/DELETE individual items; Notes.

### Event

| Method | Route | AuthZ | Notes |
| ------ | ----- | ----- | ----- |
| GET | `.../events` | Member | Scheduled, not hidden |
| POST | `.../events` | Owner | `{ title, type, startsAt }` → 201 · Status=`scheduled` |
| GET | `.../events/{eventId}` | Member | Metadata + plan lines from **copied** labels only |
| POST | `.../events/{eventId}/apply-setlist` | Owner | `{ setlistId, expectedVersion, confirmReplace? }` · ADR-0021 |

**Not in thin slice:** PATCH event metadata; cancel; hand-built items; item patch; RSVP.

---

## Domain/Application Behavior

### Setlist

- Name required non-blank (provisional max length OK).
- Items: denormalized `GroupId` from Setlist; `SortOrder` explicit; no unique(ArrangementId).
- Replace items: reject any soft-deleted Arrangement; one transaction; bump Setlist `Version`.
- Template read may join live Song/Arrangement for display labels (**editing UX only**).

### Event

- Type ∈ `rehearsal`\|`performance`\|`other`; Title required; `StartsAt` timestamptz (UTC).
- List excludes cancelled/hidden.
- Detail plan: ordered `EventSetlistItem` with copied labels — **never** require live Arr/Song Include or `IgnoreQueryFilters()` for display.

### Apply (ADR-0021)

1. Load Event + Setlist same Group; Event not cancelled.
2. Every template Arrangement exists, same Group, **not** soft-deleted — else fail with blockers.
3. If Event has ≥1 items and `confirmReplace` ≠ true → **409**.
4. Delete all EventSetlistItems; insert copies (order, ArrangementId; overrides null).
5. Copy `displaySongTitle` / `displayArrangementLabel` from **current** Song Title / Arrangement Label.
6. Set `sourceSetlistId`; bump Event `Version`.
7. Empty Setlist: **reject Apply with 400** (thin product default — avoid silent empty wipe; empty plan without apply remains valid).

No append/merge/live sync.

---

## Persistence / Transaction Requirements

- **No new migration expected.**
- Setlist item replace and Apply each run in **one Application transaction**.
- Composite FKs remain RESTRICT; do not cascade-destroy Event history.
- Soft-deleted Arr rows remain; EventSetlistItem FKs stay valid after apply even if Arr later soft-deleted.

---

## Authorization

| Actor | Behavior |
| ----- | -------- |
| Anonymous | **401** |
| Non-member | **404** (no existence leak) |
| Member | Read Setlists/Events/plans; mutate → **403** |
| Owner | All thin mutate operations |

Membership from server session + route `groupId` — never trust client tenant alone (ADR-0019).

---

## Concurrency

- Setlist PATCH / PUT items: require `expectedVersion`; success returns new `version`; stale → **409**.
- Apply: require Event `expectedVersion`; stale → **409**.
- Same integer `Version` / EF concurrency token pattern as repertoire (ADR-0023).

---

## Historical Event Plan

- Copied labels at apply time (ADR-0018).
- Later Setlist edits do not change Event plan until confirmed replace apply.
- Soft-deleted Arr after apply: keep plan line; show copied labels (tombstone); materials NOT GUARANTEED.
- `sourceSetlistId` provenance only.

---

## Testing Strategy

| Layer | Focus |
| ----- | ----- |
| Application | AuthZ; item replace rejects soft-deleted Arr; Apply label copy; plan independence after Setlist edit; confirmReplace 409; expectedVersion 409; Apply fails on soft-deleted template Arr; empty Setlist Apply 400 |
| API | HTTP contracts + CSRF on mutating verbs |
| Integration (as needed) | Apply transaction + Postgres concurrency |
| Playwright | **One** Owner journey: Setlist → Event → Apply → plan visible (optional: Setlist edit does not change plan) |

No RSVP/file/exhaustive matrix. Member E2E deferred (no invite seed).

---

## Ticket Dependency Graph

```text
T-3.3.01  Setlist Application + API
    │
    │         T-3.3.02  Event Application + API
    │              │
    └──────┬───────┘
           ▼
     T-3.3.03  Apply Setlist → Event Plan
           │
           ▼
     T-3.3.04  React Setlist + Event + Apply UI
           │
           ▼
     T-3.3.05  Sparse Playwright journey
```

**Parallel:** T-3.3.01 ∥ T-3.3.02.  
**Serial:** 03 after both; 04 after 03; 05 after 04.

**Why not the initially suggested “Setlist UI in 02 / journey in 05” split:** Setlist UI without Event/Apply cannot demonstrate the product bet; splitting UI across tickets increases ceremony without reducing risk. Schema foundation tickets are omitted because tables already exist.

**Thinness:** None of the five can be dropped without losing Setlist, Event, Apply, UI, or CI proof. UI+Playwright stay separate for the same review gate pattern as T-3.2.07/08.

---

## Tickets

### T-3.3.01 — Setlist Application + API

| | |
|--|--|
| **Goal** | Productize existing Setlist/SetlistItem persistence into Application + HTTP. |
| **User-visible outcome** | Owner can create a named Setlist, save an ordered list of live Arrangements, rename it; Member can list/open it (via API; UI in 04). |
| **Scope** | Create/list/get/rename; `PUT .../items` full replace; AuthZ; Version concurrency; soft-deleted Arr rejection on replace. |
| **Non-scope** | UI; Event; Apply; Setlist delete; item overrides; per-item POST/DELETE. |
| **Dependencies** | Phase 3.2 Arrangement APIs (live Arrs). |
| **Backend** | Handlers + store abstractions mirroring Repertoire patterns; endpoints above. |
| **Frontend** | None. |
| **Persistence** | None expected (reuse tables). |
| **Tests** | Application/API AuthZ; replace items; soft-deleted Arr; expectedVersion 409. |
| **Acceptance** | Owner replaces items with 2+ Arrs (incl. duplicate Arr ALLOWED); Member GET works; non-member 404; Member PUT 403. |
| **Security/AuthZ** | As Authorization section. |
| **Concurrency** | Setlist `expectedVersion` on PATCH and PUT items. |
| **Historical** | N/A (template is live). |

### T-3.3.02 — Event Application + API (create/list/get)

| | |
|--|--|
| **Goal** | Productize Event root create/list/get **without** Apply. |
| **User-visible outcome** | Owner creates a dated Event (title/type/startsAt); Member can list/open empty plan. |
| **Scope** | POST/GET list/GET detail; Status=`scheduled`; plan array empty until 03. |
| **Non-scope** | Apply; cancel; PATCH; RSVP; hand-built items; UI. |
| **Dependencies** | Group membership only (∥ 01). |
| **Backend** | Event handlers + endpoints; detail returns items from DB (copied fields when present). |
| **Frontend** | None. |
| **Persistence** | None expected. |
| **Tests** | AuthZ; validation of type/title/startsAt; list filters cancelled/hidden. |
| **Acceptance** | Owner creates Event; Member GET sees title/type/startsAt; plan `[]`. |
| **Security/AuthZ** | As Authorization section. |
| **Concurrency** | Create returns `version`; no mutate beyond create in this ticket. |
| **Historical** | Read path must not use `IgnoreQueryFilters()` or required Arr Include. |

### T-3.3.03 — Apply Setlist → Event Plan

| | |
|--|--|
| **Goal** | Implement ADR-0021 Replace Event Plan from Setlist. |
| **User-visible outcome** | Owner applies a Setlist; Event Plan shows ordered copied labels; re-apply requires `confirmReplace`; Setlist edits do not alter prior plan. |
| **Scope** | `POST .../apply-setlist`; label copy; `sourceSetlistId`; confirmReplace; soft-deleted template Arr failure; empty Setlist → 400. |
| **Non-scope** | Hand-built plans; overrides; RSVP; UI. |
| **Dependencies** | T-3.3.01, T-3.3.02. |
| **Backend** | Single-transaction Apply handler. |
| **Frontend** | None. |
| **Persistence** | Transactional delete+insert EventSetlistItems; no migration. |
| **Tests** | Label copy correctness; independence after Setlist change; confirmReplace 409; expectedVersion 409; soft-deleted Arr blocks apply; empty Setlist 400. |
| **Acceptance** | Apply populates plan; second apply without confirmReplace → 409; with confirmReplace succeeds; post-edit Setlist ≠ Event plan until re-apply. |
| **Security/AuthZ** | Owner only; Member → 403. |
| **Concurrency** | Event `expectedVersion`. |
| **Historical** | Copied labels only; no IgnoreQueryFilters for plan display. |

### T-3.3.04 — React Setlist + Event + Apply UI

| | |
|--|--|
| **Goal** | Browser journey for S2 with Owner mutate / Member read gating. |
| **User-visible outcome** | Owner completes Library → Setlist → Event → Apply → view plan in UI; Member sees read-only Setlists/Events/plan. |
| **Scope** | Group shell links; Setlist list/create/detail (pick Arrs, reorder via simple controls, save, rename); Event list/create/detail; Apply + confirmReplace dialog; CSRF/cookie client reuse. |
| **Non-scope** | Drag-and-drop; overrides; cancel; RSVP; invites; new state library; file upload; Playwright (05). |
| **Dependencies** | T-3.3.03 (and thus 01–02). |
| **Backend** | None beyond consuming APIs. |
| **Frontend** | React/Vite/TS/Tailwind routes + pages; Member hides mutate controls (Library pattern). |
| **Persistence** | None. |
| **Tests** | Manual smoke of Owner journey; light component checks optional. |
| **Acceptance** | Owner can demo full S2 path without API tools; Member cannot mutate. |
| **Security/AuthZ** | UI gating is UX only; server remains authoritative. |
| **Concurrency** | Surface 409 on stale version (same pattern as Library). |
| **Historical** | Event detail renders plan from API copied labels. |

### T-3.3.05 — Sparse Playwright Owner journey

| | |
|--|--|
| **Goal** | CI-critical path for S2. |
| **User-visible outcome** | Automated proof: Setlist → Event → Apply → plan visible. |
| **Scope** | One (optionally two) Playwright tests in `e2e/`; reuse helpers; full suite green. |
| **Non-scope** | Member E2E; 409 E2E matrix; RSVP; files; exhaustive cases. |
| **Dependencies** | T-3.3.04. |
| **Backend / Frontend** | Test-only. |
| **Persistence** | None. |
| **Tests** | TC-EVT-01 (name flexible): Owner Setlist compose → Event create → Apply → assert plan labels. Optional TC-EVT-02: Setlist reorder does not change Event until re-apply. |
| **Acceptance** | Playwright job green on PR. |
| **Security/AuthZ** | Uses real cookie session path. |
| **Concurrency / Historical** | Optional second test covers historical independence. |

---

## Open Questions

Only items that need a default for implementers (resolved for thin slice unless human overrides before authorization):

| ID | Decision for thin S2 |
| -- | -------------------- |
| Q-S1 | **Resolved:** `PUT .../items` full replace only. |
| Q-S2 | **Resolved:** Template detail may join live Song/Arr labels; Event plan must not. |
| Q-S3 | **Resolved:** Empty Setlist Apply → **400**. |
| Q-S4 | **Resolved:** Browser-local datetime input → store UTC `StartsAt`. |
| Q-S5 | **Resolved:** Provisional max lengths OK (same posture as Q-R3). |

No ADR-blocking contradictions. Invite/Member E2E remains deferred by product choice, not an open blocker for Owner demo.

---

## Critical thinness review

| # | Check | Result |
| - | ----- | ------ |
| 1 | Owner completes journey? | Yes (01–05). |
| 2 | Member consumes plan? | Yes (read APIs + UI gating). |
| 3 | Uses existing Arrangements? | Yes. |
| 4 | Avoids file/blob? | Yes. |
| 5 | Preserves copy-on-apply? | Yes (03). |
| 6 | Avoids RSVP/invite? | Yes. |
| 7 | Avoids hand-built plans? | Yes. |
| 8 | Avoids overrides? | Yes. |
| 9 | Avoids new state libraries? | Yes. |
| 10 | Removable ticket? | No — five is floor for bet + CI proof. |

---

## Exit

- Thin S2 **COMPLETED** on `develop` (PR #6, merge `80f5f63`). Tickets T-3.3.01–05 closed.
- Phase 3.4 thin invites **shipped** (PR #8, merge `8db0714`). Next authorized: Phase 3.5 thin RSVP ([`PHASE-3.5-RSVP-SPEC.md`](PHASE-3.5-RSVP-SPEC.md)). T-3.2.06 remains deferred.
