# PHASE-3.2 — Song / Arrangement / Resource technical specification

**Status:** Approved Phase 3.2 scope **COMPLETED** (T-3.2.01–05, 07, 08) — backend + React Library Shell + sparse Playwright.  
**Deferred:** T-3.2.06 file Resource / blob / content (not automatic next).  
**Next:** requires human decision / authorization; may include already-documented deferred or later items.  
**Date:** 2026-09-16  
**Depends on:** ADR-0024, ADR-0025, ADR-0019–0023, ADR-0007/0008/0014  

**Implemented MVP slice:**

```text
Song → Arrangement → Link Resource
(+ React Library Shell + sparse Playwright E2E)
```

**Deferred:** File Resource / blob storage / `IBlobStore` / upload / content download (ticket T-3.2.06).

Accepted ADRs remain authoritative. Domain still allows `Kind = file` later; API rejects `kind=file` until T-3.2.06 is authorized.

Companion surfaces: [`API.md`](API.md) · [`PERSISTENCE.md`](PERSISTENCE.md) · [`TESTING.md`](TESTING.md) · tickets §14 below.

---

## 0. Schema alignment (COMPLETE)

T-3.2.01 migration `AlignRepertoireToAdr0024And0025` aligned EF entities to ADR-0025 / this spec (OriginKind; no IsDefault; int BPM; Resource Label/Part/Kind/Url).  
File-oriented columns (`ObjectKey`, `ContentType`, `ByteSize`, …) remain **nullable** for future `Kind=file`; **no file upload path** in the current MVP.

---

## 1. Domain assumptions used (ACCEPTED)

| Topic | Rule | Source |
| ----- | ---- | ------ |
| Song | Group-scoped work identity; Title required; duplicate titles ALLOWED; OriginKind; optional Attribution/RightsNotes; may have **zero** Arrangements | ADR-0025 |
| No IsDefault / no auto Arrangement on Song create | FACT | ADR-0025 |
| Arrangement | Separate aggregate; immutable GroupId+SongId; Label required; optional key/BPM/lyrics/chords/structure/notes | ADR-0025 |
| Resource | Arrangement child; Kind file\|link; Purpose enum (+practice); Label required; Part optional free text; hard-delete | ADR-0024 |
| Soft-delete | Song/Arr soft; Song DELETE cascades live Arr soft-delete in one tx; Resources left | ADR-0025 / 0023 |
| Concurrency | Integer Version on Song/Arrangement; Resource has **no** Version (child) | PERSISTENCE §6 |
| AuthZ | Membership; non-member 404; wrong role 403; anonymous 401; never trust client GroupId | ADR-0019 |
| Event history | Copied display labels; no Resource snapshots; no IgnoreQueryFilters for Event read | ADR-0018 / 0023 |

---

## 2. API contract

Base path: `/api/groups/{groupId}/...`  
Auth: cookie session + CSRF on POST/PUT/PATCH/DELETE (ADR-0020).  
Soft-deleted Songs/Arrangements: **invisible** on normal GET/list (404 if id known).  
**Pagination:** none for MVP — full list ordered by Title / Label / CreatedAt as specified.  
**Filtering:** none beyond soft-delete exclusion (no search API in this slice).

### 2.0 PATCH semantics (Song, Arrangement, Resource)

Authoritative MVP contract (matches implementation):

| Client sends | Effect |
| ------------ | ------ |
| Field **omitted** | Keep current value |
| JSON **`null`** | Keep current value (**does not clear**) |
| Non-null value | Apply it |
| Optional text that is whitespace-only after trim | Store **`null`** |

**Arrangement `defaultBpm`:** optional; valid range **1–400**. Omitted or JSON `null` → unchanged. Current MVP PATCH **cannot clear** an existing `DefaultBpm` (no dedicated clear sentinel). Recorded as an MVP limitation — do not invent a clearing mechanism without a later ticket.

**`expectedVersion`:** required on Song PATCH/DELETE and Arrangement PATCH/DELETE. Stale version → **409**.  
**Later hardening (do not change in this docs sync):** missing/malformed `expectedVersion` may surface as **409** on some Song/Arrangement PATCH and Arrangement DELETE paths (vs an explicit **400** on Song DELETE when `< 1`). Clients should always send the version from GET.

### 2.1 Songs

| Op | Method | Route | Role | Body | Success | Failures |
| -- | ------ | ----- | ---- | ---- | ------- | -------- |
| List | GET | `.../songs` | Member | — | 200 `SongListItem[]` | 401, 404 |
| Create | POST | `.../songs` | Owner | create | 201 `SongDetail` | 401, 403, 404, 400 |
| Get | GET | `.../songs/{songId}` | Member | — | 200 `SongDetail` | 401, 404 |
| Update | PATCH | `.../songs/{songId}` | Owner | patch + `expectedVersion` | 200 `SongDetail` | 401, 403, 404, 400, 409 |
| Delete | DELETE | `.../songs/{songId}` | Owner | `{ expectedVersion }` | 204 | 401, 403, 404, 400, 409 |

**Create body**

```json
{
  "title": "string",
  "attribution": "string | null",
  "originKind": "original | cover | other",
  "rightsNotes": "string | null"
}
```

**Patch body** — any subset of create fields + required `expectedVersion` (see §2.0).

**SongListItem:** `{ id, title, attribution, originKind, version, createdAt, updatedAt }`  
**SongDetail:** list fields + `rightsNotes` + optional `arrangementCount` (live only; Application-computed).

**Delete:** Song `expectedVersion` only; cascade per ADR-0025 §8a.

### 2.2 Arrangements

| Op | Method | Route | Role | Body | Success | Failures |
| -- | ------ | ----- | ---- | ---- | ------- | -------- |
| List by Song | GET | `.../songs/{songId}/arrangements` | Member | — | 200 `ArrangementListItem[]` | 401, 404 |
| Create | POST | `.../songs/{songId}/arrangements` | Owner | create | 201 `ArrangementDetail` | 401, 403, 404, 400 |
| Get | GET | `.../arrangements/{arrangementId}` | Member | — | 200 `ArrangementDetail` (+ resource summaries) | 401, 404 |
| Update | PATCH | `.../arrangements/{arrangementId}` | Owner | patch + `expectedVersion` | 200 `ArrangementDetail` | 401, 403, 404, 400, 409 |
| Delete | DELETE | `.../arrangements/{arrangementId}` | Owner | `{ expectedVersion }` | 204 | 401, 403, 404, 400, 409 |

**Create body**

```json
{
  "label": "string",
  "defaultKey": "string | null",
  "defaultBpm": "number | null",
  "lyrics": "string | null",
  "chords": "string | null",
  "structure": "string | null",
  "notes": "string | null"
}
```

**GroupId/SongId:** from route + Song load — **not** client-writable after create.  
**List order:** `CreatedAt` ascending (stable).  
**ArrangementListItem:** `{ id, songId, label, defaultKey, defaultBpm, version, createdAt, updatedAt }`  
**ArrangementDetail:** list + lyrics/chords/structure/notes + `resources: ResourceSummary[]`.  
**No `IsDefault`.** Song may have **zero** Arrangements.

Soft-deleted Song → create/list Arrangements under that song → **404**.

### 2.3 Resources — **Link only** (nested routes; authoritative)

All Resource HTTP operations are **Arrangement-scoped**. Flat `/api/groups/{groupId}/resources/{resourceId}` routes are **not** part of the MVP contract.

| Op | Method | Route | Role | Body | Success | Failures |
| -- | ------ | ----- | ---- | ---- | ------- | -------- |
| List | GET | `.../arrangements/{arrangementId}/resources` | Member | — | 200 `ResourceSummary[]` | 401, 404 |
| Create link | POST | `.../arrangements/{arrangementId}/resources` | Owner | JSON link create (`kind` must be `link`) | 201 `ResourceDetail` | 401, 403, 404, 400 |
| Get | GET | `.../arrangements/{arrangementId}/resources/{resourceId}` | Member | — | 200 `ResourceDetail` | 401, 404 |
| Update metadata | PATCH | `.../arrangements/{arrangementId}/resources/{resourceId}` | Owner | purpose/label/part/note | 200 `ResourceDetail` | 401, 403, 404, 400 |
| Delete | DELETE | `.../arrangements/{arrangementId}/resources/{resourceId}` | Owner | — | 204 | 401, 403, 404 |

**Not in current MVP**

| Op | Status |
| -- | ------ |
| Create file Resource | **DEFERRED** (T-3.2.06) |
| `GET .../arrangements/{arrangementId}/resources/{resourceId}/content` | **DEFERRED** — file download/stream only; links expose `url` on ResourceDetail for the client to open |

**Link create body**

```json
{
  "kind": "link",
  "purpose": "chart|lyrics|audio|click|reference|practice|other",
  "label": "string",
  "part": "string | null",
  "note": "string | null",
  "url": "https://..."
}
```

- `url` **required** on create; **immutable** after create (not accepted on PATCH).  
- Reject `kind: "file"` with **400** until T-3.2.06 is authorized.  
- PATCH: `purpose`, `label`, `part`, `note` only (semantics §2.0). **`kind` immutable** — cannot convert link → file.  
- **No** Resource.Version · **No** Resource.DeletedAt · **No** Resource.GroupId · hard-delete only.

**ResourceSummary / ResourceDetail:** `{ id, arrangementId?, kind, purpose, label, part, note, url, createdAt }`  
(File-only fields omitted from DTOs until file Kind is implemented.)

Soft-deleted Arrangement → all Resource routes for that Arr → **404**. AuthZ derives through Arrangement → Song → Group membership.

---

## 3. Authorization matrix

| Operation | Anonymous | Non-member | Member | Owner |
| --------- | --------- | ---------- | ------ | ----- |
| List/Get Song, Arr, Resource | 401 | 404 | 200 | 200 |
| Create/Update/Delete Song | 401 | 404 | 403 | ok |
| Create/Update/Delete Arrangement | 401 | 404 | 403 | ok |
| Create/Update/Delete Resource (link) | 401 | 404 | 403 | ok |

Application loads Membership by `(UserId, GroupId)` from route; **never** authorize from client-supplied tenant alone.

---

## 4. Concurrency contract

| Aggregate | Mutations needing `expectedVersion` | On success | Stale |
| --------- | ----------------------------------- | ---------- | ----- |
| Song | PATCH, DELETE | Version += 1 | 409, no write |
| Arrangement | PATCH, DELETE | Version += 1 | 409, no write |
| Song DELETE cascade | Client: Song `expectedVersion` only | Song +=1; each **live** Arr +=1 | Song stale **or** Arr concurrency token conflict → **409 full rollback** |
| Resource | **None** — no Resource.Version | — | N/A |

Matches Group soft-delete pattern and ADR-0025 §8a.  
Resource hard-delete does **not** bump Arrangement.Version (PERSISTENCE default).

---

## 5. Persistence model

### Songs / Arrangements

As ADR-0025 / PERSISTENCE §1.4–1.5, plus **max lengths** §7.  
EF global query filter: `DeletedAt == null` on Song and Arrangement.  
`UNIQUE (GroupId, Id)` on both.  
Composite FK: Arrangement `(GroupId, SongId)` → Songs `(GroupId, Id)` RESTRICT.

### Resources (refined Kind nullability)

| Column | file | link |
| ------ | ---- | ---- |
| Kind | `file` | `link` |
| Purpose, Label | required | required |
| Part, Note | optional | optional |
| Url | **NULL** | **required** (https/http) |
| ObjectKey | **required** (server-set) | **NULL** |
| ContentType | required (validated MIME) | **NULL** |
| ByteSize | required (≥0) | **NULL** |
| OriginalFileName | optional | **NULL** |

**No** Resource.Version. **No** Resource.DeletedAt (hard-delete). **No** GroupId on Resource.  
FK `ArrangementId` → Arrangements RESTRICT.  
Application enforces Kind-specific nullability; optional DB CHECK later.

---

## 6. Transaction boundaries

| Use case | Transaction must include |
| -------- | ------------------------ |
| Create Song | Insert Song |
| Update Song | Version check + update Song |
| Delete Song | Song soft-delete + soft-delete all live Arrs (ADR-0025 §8a) |
| Create Arrangement | Insert Arr (Song must be live; GroupId from Song) |
| Update / Delete Arrangement | Version check + mutate Arr only |
| Create Resource (link) | Insert Resource row (`kind=link`, Url set; file columns null) |
| Create Resource (file) | **DEFERRED** — T-3.2.06 |
| Update Resource metadata | Update Resource columns |
| Delete Resource (link) | Delete row (no blob) |
| Delete Resource (file) | **DEFERRED** — T-3.2.06 |

No distributed transactions. No domain-event bus.

---

## 7. Validation / limits

**Trim** all user strings on write. Whitespace-only → invalid for required fields.  
Optional empty/whitespace string after trim → **store NULL** (not empty string).  
On **PATCH**, JSON `null` means omit/keep — see §2.0 (JSON `null` does **not** clear optional fields).

| Field | Required | Max length (PROVISIONAL — confirm in Phase 3.2 review) |
| ----- | -------- | ------------------------------------------------------ |
| Song.Title | Yes | 200 |
| Song.Attribution | No | 300 |
| Song.RightsNotes | No | 2000 |
| Song.OriginKind | Yes | enum |
| Arrangement.Label | Yes | 200 |
| Arrangement.DefaultKey | No | 32 |
| Arrangement.DefaultBpm | No | int 1–400; PATCH cannot clear via null |
| Arrangement.Lyrics / Chords / Structure / Notes | No | 100_000 each |
| Resource.Label | Yes | 200 |
| Resource.Part | No | 100 |
| Resource.Note | No | 2000 |
| Resource.Url | Yes on link create; immutable after | 2000 |

These limits mirror Group.Name (200) and keep body text bounded. **Q-R3** may confirm later — not a new ADR unless product rejects them.

---

## 8. Resource file / link decision

| Topic | First implementation slice |
| ----- | -------------------------- |
| Link Kind | **IN SCOPE** |
| File Kind | **DEFERRED** — domain enum may still allow `file` later; API rejects `kind=file` until authorized |
| `IBlobStore` / local FS / cloud | **DEFERRED** — do **not** implement a local filesystem provider in this slice |
| Upload / MIME / size / compensation | **DEFERRED** |
| `GET .../content` | **DEFERRED** — clients use Resource `url` for links |

**OPEN (blocks file slice only; does not block first implementation):**

| ID | Question |
| -- | -------- |
| Q-R1 | Blob storage approach when file Kind is authorized (vendor / adapter) |
| Q-R2 | Upload size / MIME allowlist |
| Q-R3 | Confirm §7 max lengths (minor; provisional table may ship with link slice if accepted) |

---

## 9. Setlist / Event compatibility

| Scenario | Behavior |
| -------- | -------- |
| Add soft-deleted Arr to Setlist | Application rejects (400/409) |
| Soft-delete Arr (or Song cascade) while SetlistItems reference it | Items **remain**; Apply fails until Owner fixes template |
| Soft-delete Song | Cascades live Arr soft-delete; SetlistItems remain; Apply fails for those Arrs |
| Event history | Uses `displaySongTitle` / `displayArrangementLabel`; **no** live Song/Arr join; **no** IgnoreQueryFilters |
| Resource delete / Arr soft-delete | Event plan unchanged; materials availability NOT GUARANTEED |

This slice does **not** implement Setlist/Event APIs — only must not break their contracts / FKs.

---

## 10. Domain vs Application vs Persistence/API

| Concern | Domain | Application | DB/API |
| ------- | ------ | ----------- | ------ |
| Non-blank Title/Label; OriginKind; BPM range; Purpose/Kind enums; immutable Arr lineage | Yes | Yes | CHECK / enum |
| Max lengths | — | — | Yes |
| Membership / Owner / 404 vs 403 | — | Yes | status codes |
| Song cascade soft-delete | — | Yes (tx) | concurrency tokens |
| Soft-deleted Arr blocked for Setlist add / Apply | — | Yes | — |
| Resource Kind nullability | Yes (invariants) | Yes | optional CHECK |
| expectedVersion | Domain ensure on Song/Arr | Orchestrate | 409 |
| UUID / CSRF / JSON | — | — | Yes |
| ObjectKey / ByteSize | — | **DEFERRED** (file slice) | never client |

---

## 11. Testing matrix

### Domain

- Song: create/rename/soft-delete version; OriginKind; blank title reject; cascade not in domain (Application)  
- Arrangement: label; BPM bounds; soft-delete version; cannot change SongId  
- Resource (link): purpose/label; part optional; Url required; reject `kind=file`  

### Application

- AuthZ matrix (member/owner/non-member)  
- Song CRUD + delete cascade + 409 Song stale + 409 Arr race  
- Arrangement CRUD under live Song; 404 under deleted Song  
- Resource link CRUD; AuthZ via Arrangement → Group  
- Soft-deleted Arr → Resource ops 404  

### API

- 401/403/404/409/400 CSRF + validation  
- DTOs for all endpoints  

### PostgreSQL integration

- Composite FK Arr→Song  
- Soft-delete filters  
- Song cascade transaction rollback on conflict  
- Resource Kind nullability for **link** rows (Url set; file columns null)  
- No Event path needs IgnoreQueryFilters  

### Playwright (sparse)

After UI exists for library:

1. Owner creates Song → creates Arrangement → adds link Resource → Member sees materials  

Do **not** expand E2E for every CRUD edge.

---

## 12. Frontend integration boundary

- Reuse existing cookie + CSRF client patterns from Group shell.  
- Library routes under `/groups/{groupId}/songs...` (exact UI routes implementer’s choice within React shell).  
- Display `version` on edit forms for expectedVersion.  
- Member: read-only; Owner: mutate.  
- No new auth stack.

---

## 13. Implementation firewall (binding)

Do **not** introduce: IsDefault · Song title uniqueness · mandatory Arrangement on Song create · Part entity · PracticeMaterial · Member→Part · ChordPro-required · transposition · Arr version history · polymorphic asset platform · JWT web auth · new roles · RLS-as-AuthZ · CQRS/ES · microservices · unapproved dependencies · **file upload / IBlobStore / local FS blob provider** (until T-3.2.06 authorized).

Missing decision → **STOP** and escalate.

---

## 14. Tickets — dependency graph and execution order

IDs are stable. **Execution order ≠ ID numeric order.**

### Dependency graph

```text
T-3.2.01  Schema (Song/Arr/Resource columns; link-capable)
    │
    ▼
T-3.2.02  Song CRUD (no cascade yet beyond empty-Song delete)
    │
    ▼
T-3.2.04  Arrangement CRUD (soft-delete Arr; Resources not yet)
    │
    ├──────────────────────────────┐
    ▼                              ▼
T-3.2.03  Song delete cascade     T-3.2.05  Link Resource CRUD
    │                              │
    └──────────────┬───────────────┘
                   ▼
              T-3.2.07  React library shell (link only)
                   │
                   ▼
              T-3.2.08  Playwright library journey

T-3.2.06  File Resource / blob / content  ── DEFERRED (not in first slice)
          Depends later: T-3.2.05 + human Q-R1/Q-R2
```

### Corrected execution order (first slice)

1. **T-3.2.01** → 2. **T-3.2.02** → 3. **T-3.2.04** → 4. **T-3.2.03** → 5. **T-3.2.05** → 6. **T-3.2.07** → 7. **T-3.2.08**

**T-3.2.03 must not start before T-3.2.04:** cascade soft-deletes live Arrangements; Arrangement persistence + Application soft-delete must exist. Song-only delete of a Song with zero Arrangements may be covered in T-3.2.02; full cascade coverage is T-3.2.03.

No ticket in the first slice depends on a later first-slice ticket. **T-3.2.06 is out of the first slice.**

### Ticket details

#### T-3.2.01 — Persist Song/Arrangement/Resource schema to ADR-0024/0025 — **COMPLETE**

- **Depends:** none  
- **Objective:** Align EF + migration (OriginKind; remove IsDefault; int BPM; Resource Label/Part/Kind/Url; nullable file columns unused).  
- **Out:** API, UI, blob store, creating `file` rows  

#### T-3.2.02 — Song domain + Application CRUD — **COMPLETE**

- **Depends:** T-3.2.01  
- **Objective:** Song create/list/get/update/soft-delete with AuthZ + Version (Songs with zero Arrangements).  
- **Out:** Cascade over live Arrangements (T-3.2.03); Resources; UI  

#### T-3.2.04 — Arrangement domain + Application CRUD — **COMPLETE**

- **Depends:** T-3.2.01, T-3.2.02  
- **Objective:** Arrangement create/list/get/update/soft-delete; immutable lineage.  
- **Out:** Song cascade; Resources; UI  

#### T-3.2.03 — Song delete cascade (live Arrangements) — **COMPLETE**

- **Depends:** T-3.2.02, **T-3.2.04**  
- **Objective:** ADR-0025 §8a transactional cascade + 409 semantics.  
- **Out:** Setlist Apply UI; Resources  

#### T-3.2.05 — Link Resource metadata CRUD — **COMPLETE**

- **Depends:** T-3.2.04  
- **Objective:** Create/list/get/patch/hard-delete **link** Resources only (nested routes); reject `kind=file`.  
- **Out:** File upload, `content` endpoint, IBlobStore, UI  

#### T-3.2.06 — File Resource / blob / content — **DEFERRED / NOT PART OF CURRENT MVP**

- **Status:** Future phase/ticket set  
- **Depends (when authorized):** T-3.2.05 + human Q-R1 + Q-R2  
- **Objective (future):** `IBlobStore`, file create, `GET .../content`, blob delete compensation  
- **Out of current MVP:** all of the above — **do not** implement local FS “just because”  

#### T-3.2.07 — React library shell (Song / Arrangement / link Resource) — **COMPLETE**

- **Depends:** T-3.2.02, T-3.2.03, T-3.2.04, T-3.2.05 + docs contract sync  
- **Objective:** Minimal Owner/Member UI after backend stable.  
- **Shipped:** `/groups/:groupId/library` Song CRUD UI; Arrangement CRUD UI; Link Resource UI; Owner mutate / Member read gating; expectedVersion conflict UX; no file/blob UI.  
- **Out:** File upload UI; polish/search  

#### T-3.2.08 — Playwright critical library journey — **COMPLETE**

- **Depends:** T-3.2.07 + CI stack  
- **Shipped:** **TC-LIB-01** Owner Song→Arr→link Resource; **TC-LIB-02** Owner Song soft-delete from library; **TC-LIB-03** non-member denied library by URL; full Playwright suite green on `develop` CI.  
- **Deferred (explicit):** Member browser E2E; 409 conflict E2E; file Resource flows; exhaustive matrix.
---

## 15. Unresolved decisions (human)

| ID | Question | Blocks current MVP frontend? |
| -- | -------- | ---------------------------- |
| Q-R3 | Confirm §7 max lengths | No (provisional limits shipped with link slice) |
| Q-R1 | Blob approach for file Kind | **No** — only T-3.2.06 |
| Q-R2 | Upload size / MIME | **No** — only T-3.2.06 |

No new ADR proposed.

---

## 16. Phase status

| Item | Status |
| ---- | ------ |
| Spec + backend T-3.2.01–05 | **COMPLETE** (integrated on `develop`) |
| Docs synced to nested Resource routes + PATCH semantics | **COMPLETE** |
| T-3.2.07 React library shell | **COMPLETE** (integrated on `develop`) |
| T-3.2.08 Playwright library journey (TC-LIB-01/02/03) | **COMPLETE** (integrated on `develop`; CI green) |
| Member browser E2E / 409 E2E | **DEFERRED** (explicit; not part of T-3.2.08 ship) |
| T-3.2.06 file/blob/content (`IBlobStore`, upload, download) | **DEFERRED** (not automatic next) |
| Approved Phase 3.2 scope (`Song → Arrangement → Link Resource` + React + sparse E2E) | **COMPLETED** |
| Next implementation | Requires **human decision / authorization** (may include deferred T-3.2.06 or later Event/Setlist/RSVP — none authorized yet) |
