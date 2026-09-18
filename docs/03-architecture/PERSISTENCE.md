# PERSISTENCE.md — Sonivo

PostgreSQL + EF Core persistence contract for the accepted domain.  
**Phase:** 2.2 **CLOSED** (ADR-0022, ADR-0023 **ACCEPTED** HUMAN-APPROVED 2026-09-15; integer `Version` concurrency ACCEPTED). Initial EF migration `InitialFoundation` created in Phase 2.3.

Domain truth: [`../02-domain/DOMAIN-MODEL.md`](../02-domain/DOMAIN-MODEL.md)  
Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md) · Tenancy/security: [`SECURITY.md`](SECURITY.md) · ADRs: [`DECISIONS.md`](DECISIONS.md)

**Principle:** Persistence implements the domain; it must not redefine it.

---

## 0. Summary decisions (Phase 2.2 ACCEPTED)

| Topic | Choice |
| ----- | ------ |
| PK | `uuid` (Guid); **application-generated** before insert |
| UUID flavor | UUID v4 (random) for MVP |
| Concurrency | Optimistic; **`integer Version`** on aggregate roots (not `xmin`) |
| Soft-delete | `DeletedAt` on Group, Song, Arrangement; EF filters; Event cancel/hide |
| Event history read | **Never** needs `IgnoreQueryFilters`; `displaySongTitle` / `displayArrangementLabel` |
| Cross-Group FK | App canonical + **three** composite FKs only (ADR-0022 **ACCEPTED**) |
| `UNIQUE (GroupId, Id)` | **Only** Songs + Arrangements |
| Arr soft-delete → Resources | **Leave** Resource rows/blobs; explicit Resource DELETE is hard-delete |
| GroupId column | Membership, Song, Arrangement, Setlist, SetlistItem, Event, EventSetlistItem; **not** Resource/RSVP |
| Cascades | No cascade destroying Event plan history; composite FKs **ON DELETE RESTRICT** |
| Repositories | No generic repository; DbContext in Infrastructure |
| Lazy loading | **Off** |
| PG enums | **Avoid**; `text` + CHECK |

---

## 1. Persistence model overview

Naming: tables **PascalCase plural** in docs; implementers may use EF snake_case naming convention later without changing meaning.

### 1.1 User (Identity-owned)

| | |
| - | - |
| Table | ASP.NET Identity `AspNetUsers` (and related Identity tables) |
| PK | `Id uuid` |
| Scope | Platform (not Group-scoped) |
| Domain refs | `UserId` only; **no** password/hash columns in domain tables |

App may extend `IdentityUser<Guid>` with display fields (e.g. `DisplayName`). Auth fields remain Identity’s.

**Not client-controlled:** password hash, security stamp, concurrency stamp (Identity).

### 1.2 Groups

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| Name | text | N | |
| CreatedAt | timestamptz | N | UTC |
| UpdatedAt | timestamptz | N | UTC |
| DeletedAt | timestamptz | Y | Soft-delete |
| Version | int | N | Optimistic concurrency; start at 1 |

Indexes: none beyond PK for MVP (list via Membership).

### 1.3 Memberships

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| GroupId | uuid | N | FK → Groups |
| UserId | uuid | N | FK → AspNetUsers |
| Role | text | N | CHECK IN (`Owner`,`Member`) |
| CreatedAt | timestamptz | N | |

**Unique:** `(UserId, GroupId)`.  
**Index:** `(GroupId)`, `(UserId)`.  
**No** Version column (mutate via Group/Application rules; last-Owner consistency is Application + tx).

### 1.4 Songs

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| GroupId | uuid | N | FK → Groups; tenant |
| Title | text | N | Required non-blank; **no** UNIQUE(GroupId, Title) — duplicates ALLOWED (ADR-0025) |
| Attribution | text | Y | Free-text credit (ADR-0025) |
| OriginKind | text | N | CHECK IN original\|cover\|other (ADR-0025; replaces IsOriginal boolean) |
| RightsNotes | text | Y | Free-text usage notes — not licensing workflow |
| CreatedAt / UpdatedAt | timestamptz | N | |
| DeletedAt | timestamptz | Y | Soft-delete |
| Version | int | N | Concurrency |

**Unique (GroupId, Id)** — **required** alternate key for composite FKs from Arrangements. Redundant with global Id uniqueness but required by PostgreSQL for composite FK targets; cost is one extra unique index — accepted.  
**Index:** `(GroupId)` WHERE `DeletedAt IS NULL`.  
**No** `UNIQUE (GroupId, Title)`.

> **Note:** OriginKind / duplicate-title / no-IsDefault / integer BPM are **ACCEPTED** (ADR-0025). Schema alignment migration `AlignRepertoireToAdr0024And0025` (T-3.2.01) is applied.

### 1.5 Arrangements

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| GroupId | uuid | N | Denormalized tenant; must match Song.GroupId |
| SongId | uuid | N | FK → Songs |
| Label | text | N | Required non-blank; **not** unique per Song (ADR-0025) |
| Lyrics | text | Y | Plain text; Q8 may later specialize charts |
| Chords | text | Y | Plain text |
| Structure | text | Y | Plain text (e.g. “Intro / Verse / Chorus”) |
| DefaultKey | text | Y | Free text (e.g. Bb, F#m) |
| DefaultBpm | int | Y | Nullable int; when set 1–400 (ADR-0025) |
| Notes | text | Y | Free text |
| CreatedAt / UpdatedAt | timestamptz | N | |
| DeletedAt | timestamptz | Y | |
| Version | int | N | Concurrency |

**Unique:** `(GroupId, Id)` — **required** alternate key for SetlistItem/EventSetlistItem composite FKs.  
**FK Song:** composite `(GroupId, SongId)` → `Songs(GroupId, Id)` **ON DELETE RESTRICT**.  
**Index:** `(GroupId)`, `(SongId)`, `(GroupId, SongId)` WHERE `DeletedAt IS NULL`.  
**No** `IsDefault` column in MVP (ADR-0025).  
**No** JSON blob for body fields in MVP unless Q8 forces a typed chart document later (separate ADR).  
**No** Arrangement version/history table.

> **Note:** Label required + integer BPM + no IsDefault are **ACCEPTED** (ADR-0025). Schema alignment migration `AlignRepertoireToAdr0024And0025` (T-3.2.01) is applied.
### 1.6 Resources

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| ArrangementId | uuid | N | FK → Arrangements RESTRICT |
| Purpose | text | N | CHECK IN chart\|lyrics\|audio\|click\|reference\|practice\|other (ADR-0024) |
| Label | text | N | Required; max length see Phase 3.2 §7 |
| Part | text | Y | Optional free-text; **no** Purpose↔Part CHECK |
| Note | text | Y | |
| Kind | text | N | CHECK `file` \| `link` |
| Url | text | Y | **Required when Kind=link**; NULL when file |
| OriginalFileName | text | Y | Files only |
| ContentType | text | Y | **Required when Kind=file**; NULL when link |
| ByteSize | bigint | Y | **Required when Kind=file**; NULL when link |
| ObjectKey | text | Y | **Required when Kind=file**; NULL when link |
| CreatedAt | timestamptz | N | |

> **Authoritative Kind nullability + API:** [`PHASE-3.2-REPERTOIRE-SPEC.md`](PHASE-3.2-REPERTOIRE-SPEC.md) + [`PHASE-3.2.06-FILE-RESOURCE-SPEC.md`](PHASE-3.2.06-FILE-RESOURCE-SPEC.md). Link Resource CRUD shipped (T-3.2.05); File Kind + Postgres `ResourceBlobs` shipped (T-3.2.06); nested Arrangement-scoped routes including `.../content`.

**No** GroupId · **No** Version · **No** soft-delete · **No** Part table.  
**Index:** `(ArrangementId)`.  
**Not client-controlled:** `ObjectKey`, `ByteSize` (server-set after upload).  
Kind-specific nullability enforced in Application (optional DB CHECK).

### 1.7 Setlists

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| GroupId | uuid | N | FK → Groups |
| Name | text | N | |
| Notes | text | Y | Optional MVP metadata |
| CreatedAt / UpdatedAt | timestamptz | N | |
| Version | int | N | Concurrency |

**No** soft-delete. Hard-delete removes row + items.  
**No** `UNIQUE (GroupId, Id)` (not a composite FK target).  
**Index:** `(GroupId)`. Duplicate names ALLOW.

### 1.8 SetlistItems

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| SetlistId | uuid | N | FK → Setlists ON DELETE CASCADE |
| GroupId | uuid | N | Denormalized; must match Setlist.GroupId |
| ArrangementId | uuid | N | |
| SortOrder | int | N | Dense 0..n-1 preferred; **not** unique |
| OverrideKey | text | Y | |
| OverrideBpm | numeric(6,2) | Y | |
| OverrideCapo | int | Y | |
| OverrideNotes | text | Y | |

**Unique (SetlistId, ArrangementId):** **FORBIDDEN** (duplicates ALLOW).  
**Composite FK:** `(GroupId, ArrangementId)` → `Arrangements(GroupId, Id)` **ON DELETE RESTRICT**.  
**FK Setlist:** simple `SetlistId` → Setlists CASCADE; Application copies `GroupId` from Setlist (no composite to Setlist).  
**EF:** prefer **no** required `Arrangement` navigation (FK property only) so template queries never silently drop items via filters.  
**Index:** `(SetlistId, SortOrder)`.

### 1.9 Events

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| GroupId | uuid | N | FK → Groups |
| Type | text | N | CHECK rehearsal\|performance\|other |
| Title | text | N | List/display name |
| StartsAt | timestamptz | N | UTC instant (local TZ display is UI) |
| Location | text | Y | |
| Notes | text | Y | |
| Status | text | N | CHECK `scheduled`\|`cancelled` |
| CancelledAt | timestamptz | Y | Set when cancelled |
| IsHidden | boolean | N | Soft-hide from default Member lists (default false; set true on cancel) |
| SourceSetlistId | uuid | Y | Provenance FK → Setlists **ON DELETE SET NULL** |
| CreatedAt / UpdatedAt | timestamptz | N | |
| Version | int | N | Concurrency |

**No** `UNIQUE (GroupId, Id)` required (not a composite FK target).  
**Index:** `(GroupId, StartsAt)` WHERE `Status = 'scheduled' AND IsHidden = false`.

### 1.10 EventSetlistItems

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| EventId | uuid | N | FK → Events (no cascade destroy from Arr/Song) |
| GroupId | uuid | N | Denormalized; matches Event.GroupId |
| ArrangementId | uuid | N | Retained after Arr soft-delete |
| DisplaySongTitle | text | N | Copied identity |
| DisplayArrangementLabel | text | N | Copied identity |
| SortOrder | int | N | Not unique constraint |
| OverrideKey / OverrideBpm / OverrideCapo / OverrideNotes | as SetlistItem | Y | Event-specific |
| CreatedAt | timestamptz | N | |

**Composite FK:** `(GroupId, ArrangementId)` → `Arrangements(GroupId, Id)` **ON DELETE RESTRICT**.  
**Why GroupId:** enables composite same-Group FK + scoped loads without joining Event every time; aligns ADR-0019.  
**No** FK to Setlist (provenance lives on Event only).  
**Index:** `(EventId, SortOrder)`.

### 1.11 Rsvps

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| Id | uuid | N | PK |
| EventId | uuid | N | FK → Events ON DELETE CASCADE (only if Event row removed; MVP avoids Event hard-delete) |
| UserId | uuid | N | FK → AspNetUsers |
| Response | text | N | CHECK `yes`\|`no`\|`maybe` |
| UpdatedAt | timestamptz | N | |

**Unique:** `(EventId, UserId)` — upsert semantics.  
**No** GroupId (always via Event `(GroupId, EventId)` load).  
**Index:** `(EventId)`, `(UserId)`.

### 1.12 Domain-only vs persistence-only

| Kind | Examples |
| ---- | -------- |
| Domain-only | “≥1 Owner”, AuthZ, Replace Event Plan workflow, tombstone UX |
| Persistence-only | `Version`, `ObjectKey`, Identity tables, `UNIQUE(GroupId,Id)` on Songs/Arrangements |
| Derived | Blob path from Arrangement.GroupId; “materials available” from Arrangement.DeletedAt via Infrastructure port |
| Never client-controlled | ObjectKey, ByteSize, DeletedAt, Version (client sends *expected* Version only), SourceSetlistId |

---

## 2. Aggregate boundaries vs EF relationships

| Relationship | Aggregate ownership | DB relationship | EF navigation (MVP) | Application reference |
| ------------ | ------------------- | ----------------- | ------------------- | --------------------- |
| Group → Membership | Group owns | FK Membership.GroupId | Group.Memberships collection OK | Membership checks by (User,Group) |
| Group → Song | Separate aggregates | FK Song.GroupId | **No** Songs collection required on Group | Query Songs by GroupId |
| Song → Arrangement | Separate roots | Composite FK Arr→Song | Song.Arrangements **optional**; prefer query by SongId | Create Arr with SongId + GroupId |
| Arrangement → Resource | Resource inside Arr aggregate | FK Resource.ArrangementId CASCADE/App delete | Arrangement.Resources OK | Mutate Resources only via Arr use-cases |
| Group → Setlist | Separate | FK Setlist.GroupId | No required collection | Query by GroupId |
| Setlist → SetlistItem | Items inside Setlist | FK CASCADE | Setlist.Items OK | Replace/reorder items in Setlist tx |
| Group → Event | Separate | FK Event.GroupId | No required collection | Query by GroupId |
| Event → EventSetlistItem | Items inside Event | FK; delete items with Event row only | Event.Items OK | Replace-on-apply inside Event tx |
| EventSetlistItem → Arrangement | Cross-aggregate ref | Composite FK RESTRICT | **No navigation** | Load Arr separately for materials |
| Event → SourceSetlist | Provenance only | Nullable FK SET NULL | **No** Setlist.Events navigation | Null on Setlist delete |
| User → Membership | Identity ↔ tenancy | FK UserId | Avoid pulling Identity into domain | Lookup Membership |
| User → RSVP | Cross | FK UserId | **No** User.Rsvps required | Upsert by (Event,User) |
| Event → RSVP | RSVP child of Event | FK | Event.Rsvps OK | RSVP use-case |

**Rule:** Prefer **unidirectional** navigations toward children inside an aggregate. **Never** put a filtered required navigation on the Event read path.

**Lazy loading:** disabled. Explicit `Include` / projections only.

---

## 2.1 Cross-Group FK matrix (ADR-0022 **ACCEPTED**)

| Relationship | Direct FK | Composite FK | Application validation | Reason |
| ------------ | --------- | ------------ | ---------------------- | ------ |
| Arrangement → Song | — | **Yes** `(GroupId, SongId)` → Songs`(GroupId, Id)` **ON DELETE RESTRICT** | Yes | Same-Group proof |
| Resource → Arrangement | **Yes** | No | Yes (Arr scoped load) | Same-aggregate |
| SetlistItem → Arrangement | — | **Yes** `(GroupId, ArrangementId)` → Arrangements`(GroupId, Id)` **ON DELETE RESTRICT** | Yes | Cross-aggregate |
| EventSetlistItem → Arrangement | — | **Yes** `(GroupId, ArrangementId)` → Arrangements`(GroupId, Id)` **ON DELETE RESTRICT** | Yes | Cross-aggregate + history |
| Setlist → Group | **Yes** | No | Membership | Tenant root |
| Event → Group | **Yes** | No | Membership | Tenant root |
| EventSetlistItem → Event | **Yes** | No | Via Event load | Parent ownership |
| Membership → Group | **Yes** | No | Membership rules | Join table |
| RSVP → Event | **Yes** | No | Event scoped load | No Arr risk |

**Principal keys:** `UNIQUE (GroupId, Id)` on **Songs** and **Arrangements** only.

---

## 2.2 Event history independence (binding)

| Dependency | Required for Event GET identity? |
| ---------- | -------------------------------- |
| Arrangement live / not filtered | **No** — use DisplaySongTitle / DisplayArrangementLabel |
| Song live | **No** |
| Resource exists | **No** |
| Setlist exists | **No** — SourceSetlistId may be null |
| `IgnoreQueryFilters` | **No** on normal Event read |

Materials link (optional): separate Application call loads Arrangement by `(GroupId, Id)` under normal filters → miss = unavailable tombstone UX.

---

## 3. GroupId strategy (ADR-0019)

| Table | Store GroupId? | Rationale |
| ----- | -------------- | --------- |
| Memberships | Yes | Tenant join |
| Songs | Yes | Scoped load |
| Arrangements | Yes | Scoped load + composite FK to Song |
| Resources | **No** | Always via Arrangement; AuthZ loads Arr first |
| Setlists | Yes | Scoped load |
| SetlistItems | **Yes** | Composite FK to Arrangement; set from parent Setlist |
| Events | Yes | Scoped load |
| EventSetlistItems | **Yes** | Composite FK to Arrangement; set from parent Event |
| Rsvps | **No** | Via Event |

Duplication is intentional where it enables `(GroupId, Id)` loads and composite FKs — not “convenience joins” alone.

---

## 4. Cross-Group foreign key protection

See §2.1 matrix. Application remains canonical (ADR-0019). Composite FKs are the **only** extra DB tenancy constraints beyond simple FKs.

**Intentionally not DB-enforced:** “Arrangement not soft-deleted” for SetlistItem (apply fails in Application). Soft-delete leaves row → FKs remain valid.

**Rejected for MVP:** RLS; composite FKs on Resource/RSVP; UNIQUE(GroupId,Id) on every table.

---

## 5. UUID strategy

| Decision | Choice |
| -------- | ------ |
| Type | `uuid` / `Guid` |
| Generation | **Application**; **default v4** |
| DB default | Optional `gen_random_uuid()` backup; Application still supplies Id |
| Exposure | Ids public in URLs; security = membership |
| Predictability | Acceptable for MVP |

---

## 6. Concurrency model (**ACCEPTED**)

### Choice: `integer Version` (not `xmin`)

| Aggregate root | Column |
| -------------- | ------ |
| Group, Song, Arrangement, Setlist, Event | `Version int NOT NULL` |

**Initialization:** insert with `Version = 1`.  
**Increment:** on each successful concurrency-protected mutation of that root: `UPDATE … SET Version = Version + 1 WHERE Id = @id AND Version = @expectedVersion`. If zero rows updated → stale → **409**.  
**Children:** no independent Version.  
**Identity:** Identity concurrency stamp separate.  
**Never** silent overwrite.

### Mutations that require `expectedVersion` and increment Version

| Mutation | Root Version bumped |
| -------- | ------------------- |
| PATCH Group / Song / Arrangement / Setlist / Event metadata | Yes |
| Soft-delete Group / Song / Arrangement | Yes |
| Soft-delete Song (cascade) | Yes — Song Version + each **live** Arrangement Version (see below); client sends **Song** `expectedVersion` only |
| Cancel Event (status/hide) | Yes |
| Replace Event Plan (`apply-setlist`) | Yes (Event) |
| Setlist item add/update/remove/reorder/replace that persists Setlist | Yes (Setlist) |
| Create root (POST) | Sets Version=1; no expectedVersion |
| RSVP upsert | No (RSVP row only) |
| Explicit Resource hard-delete | No Arrangement Version bump required for MVP (optional bump if Arr metadata touched — default: **no**) |

### API concurrency contract

| Rule | Spec |
| ---- | ---- |
| Client receives | `version` (int) on GET of aggregate roots |
| Client sends | `expectedVersion` (int) in JSON body on mutations listed above |
| Success response | Includes the **new** `version` after increment |
| Stale `expectedVersion` | **409** Problem Details (`concurrency`); no partial write |
| Server overwrite | **Forbidden** |

### Soft-delete Song concurrency (ADR-0025 §8a; aligns with Group DELETE)

`DELETE /api/groups/{groupId}/songs/{songId}` body: `{ "expectedVersion": <Song.Version> }`.

1. Compare Song `expectedVersion`; mismatch → **409**, abort.  
2. In **one transaction**: soft-delete Song (bump Song.Version); soft-delete each Arrangement with `DeletedAt IS NULL` (bump each Arr.Version). Already-deleted Arrs untouched.  
3. Client does **not** send per-Arrangement expected versions — Song delete retires live Arrs.  
4. Arrangement rows still use `Version` as concurrency token: if any live Arr changed after load, SaveChanges/token conflict → **409**, **full rollback** (no silent overwrite, no partial cascade).  
5. Same 409 Problem Details shape as Group soft-delete / other Version conflicts.

---

## 7. Soft-delete / query filters (ADR-0023 **ACCEPTED**)

### A–J answers

| # | Answer |
| - | ------ |
| A | Filters on **Group, Song, Arrangement** only |
| B | Event GET / Event plan render must never depend on bypass |
| C | **No** — if Event→items loaded without Arrangement Include/required nav |
| D | **Risk if** Setlist Includes required Arrangement — **mitigate:** no required Arr nav; load items alone |
| E | Song filter does not remove Arrangement rows; Arr queries by SongId still see non-deleted Arrs; soft-deleted Song’s Arrs should also be soft-deleted by Application |
| F | FUTURE restore via Infrastructure port with filter bypass |
| G | Yes — materials “is this deleted?” and FUTURE restore |
| H | Narrow Infrastructure methods implementing an Application port |
| I | **No** — Application must not call `IgnoreQueryFilters` |
| J | **Yes** — bypass restricted to Infrastructure |

### Soft-delete + dependents

| Action | Arrangement | Resource | SetlistItem | EventSetlistItem |
| ------ | ----------- | -------- | ----------- | ---------------- |
| Song soft-delete | Soft-delete all Arr of Song (App) | Left in place under those Arrs | Remain | Remain (labels) |
| Arrangement soft-delete | DeletedAt set | **Remain** (hidden via Arr) | Remain | Remain |
| Resource hard-delete | — | Row+blob gone | — | Remain |
| Setlist hard-delete | — | — | Cascade delete | Remain; SourceSetlistId null |
| Group soft-delete | Hidden via Group filter / 404 | Inaccessible | Inaccessible | Inaccessible via Group routes |

### Resource on Arrangement soft-delete (chosen: **leave in place**)

| Option | Verdict |
| ------ | ------- |
| A Hard-delete immediately | Rejected — irreversible; hurts FUTURE restore; unnecessary for Event history |
| B Soft-delete Resource | Rejected — contradicts Resource hard-delete lifecycle; adds filter surface |
| C/D Leave present, inaccessible | **Chosen** — Arr filter + AuthZ hide access; blob GC/purge FUTURE with Arr hard-purge |

Signed URL residual risk: short TTL (unchanged). Explicit Resource DELETE still hard-deletes.

---

## 8. DeleteBehavior matrix

| FK | On delete of principal | Notes |
| - | ---------------------- | ----- |
| Membership.GroupId → Group | **Restrict** | Soft-delete Group; do not cascade-remove Membership rows until FUTURE hard purge |
| Membership.UserId → User | **Restrict** | Account deletion OPEN |
| Song.GroupId → Group | **Restrict** | Soft-delete Group |
| Arrangement.(GroupId,SongId) → Song | **Restrict** | Soft-delete Song/Arr in **Application**; never cascade hard-delete Arr from Song |
| Resource.ArrangementId → Arrangement | **Restrict** | Soft-delete Arr leaves Resources; explicit Resource DELETE or FUTURE Arr purge hard-deletes |
| Setlist.GroupId → Group | **Restrict** | |
| SetlistItem.SetlistId → Setlist | **Cascade** | Template items die with template |
| SetlistItem.(GroupId,ArrangementId) → Arrangement | **Restrict** | Soft-delete Arr OK (row remains) |
| Event.GroupId → Group | **Restrict** | |
| Event.SourceSetlistId → Setlist | **SetNull** | Provenance cleared; plan intact |
| EventSetlistItem.EventId → Event | **Restrict** | MVP does not hard-delete Events |
| EventSetlistItem.(GroupId,ArrangementId) → Arrangement | **Restrict** | **Critical:** never cascade |
| Rsvp.EventId → Event | **Restrict** | MVP no Event hard-delete |
| Rsvp.UserId → User | **Restrict** | |

**EF Core default cascade conventions must be overridden** wherever they would cascade into EventSetlistItem from Arrangement/Song.

**Application-managed:**

| Action | Behavior |
| ------ | -------- |
| Soft-delete Song | Set Song.DeletedAt (+ Version); soft-delete all Arrangements of Song **where DeletedAt IS NULL** (+ each Version); already-deleted Arrs unchanged; **leave** Resources; leave SetlistItems & EventSetlistItems |
| Soft-delete Arrangement | Set DeletedAt; **leave** Resources + blobs; leave SetlistItems & EventSetlistItems |
| Hard-delete Setlist | Delete Setlist (Cascade items); DB SetNull Event.SourceSetlistId |
| Cancel Event | Status=cancelled; IsHidden=true; CancelledAt=now; keep items + RSVPs |
| Hard-delete Resource | Delete row + blob; Event plan unchanged |
| FUTURE Arr purge | Hard-delete Resources + blobs when Arr permanently removed (not MVP) |

---

## 9. Song / Arrangement persistence notes

- Flat columns for lyrics/chords/structure/key/BPM/notes — **no** version table.  
- **No** `IsDefault` in MVP (ADR-0025). Prefer list-by-Label / CreatedAt for UX.  
- Song may have **zero** Arrangements: no DB check requiring ≥1.  
- Song soft-delete cascade (live Arrs only) is Application transactional — not DB ON DELETE CASCADE.  
- Q8 chart format: keep opaque text until decided; do not add JSONB “just in case.”

---

## 10. Resource persistence notes

Metadata in Postgres; bytes in object storage. Minimal columns (§1.6).  
On Arrangement soft-delete: Resources **remain** but are unreachable through normal Arrangement APIs. Explicit DELETE hard-removes.

---

## 11. Setlist persistence notes

- Duplicates of same ArrangementId **allowed**.  
- Ordering: integer `SortOrder`; reorder by rewriting 0..n−1 in one transaction; **no** fractional keys.  
- Same SortOrder on two rows: allowed transiently; reads `ORDER BY SortOrder, Id`.  
- `(SetlistId, ArrangementId)` must **not** be unique.

---

## 12. Event / EventSetlistItem notes

- EventSetlistItem **has GroupId** (justified: composite FK + ADR-0019 scoped patterns).  
- Display fields NOT NULL.  
- Overrides do not write through to Arrangement.  
- Replace Event Plan: delete all items for EventId + insert copies in **one transaction** with Event `expectedVersion` (ADR-0021).

---

## 13. sourceSetlistId semantics

- Nullable FK on Event → Setlists.  
- **ON DELETE SET NULL** (DB).  
- After Setlist hard-delete: provenance null; EventSetlistItems untouched.  
- Retaining a dangling uuid without FK: **rejected** (prefer clean null).  
- Never join Setlist for Member Event view requirements.

---

## 14. RSVP persistence

- Unique `(EventId, UserId)`.  
- Responses: `yes` | `no` | `maybe`.  
- Upsert on PUT; `UpdatedAt` refreshed.  
- No attendance workflow states beyond this in MVP.

---

## 15. Identity integration

- Single `ApplicationUser : IdentityUser<Guid>` in Infrastructure.  
- Domain/Application depend on `UserId` (Guid), not Identity types.  
- Membership.UserId FK to AspNetUsers.  
- Email normalization: Identity defaults.  
- Migrations: Identity schema + app schema in same DbContext **or** coordinated migrations — prefer **one** DbContext including Identity for MVP simplicity.  
- Do not duplicate credentials in domain tables.

---

## 16. Timestamp conventions

| Field | Use |
| ----- | --- |
| All timestamps | `timestamptz`, store **UTC** |
| CreatedAt | Insert-only |
| UpdatedAt | Root updates; Setlist/Event/Song/Arrangement/Group |
| DeletedAt | Soft-delete only |
| CancelledAt | Event cancel |
| Resource / Membership / EventSetlistItem | CreatedAt (and RSVP UpdatedAt); skip UpdatedAt on immutable-ish children unless needed |

Do not add DeletedBy in MVP (no audit product requirement).

---

## 17. PostgreSQL types

| Concept | Type |
| ------- | ---- |
| Ids | `uuid` |
| Strings | `text` (avoid tight varchar unless proven) |
| Flags | `boolean` |
| Time | `timestamptz` |
| BPM | `numeric(6,2)` |
| Capo | `int` |
| Size | `bigint` |
| Enums | `text` + **CHECK** (migration-friendly) |
| Concurrency | `integer Version` |

---

## 18. Index strategy

| Index | Serves |
| ----- | ------ |
| Membership `(UserId, GroupId)` UNIQUE | Login → groups; tenancy check |
| Membership `(GroupId)` | Member list |
| Song `(GroupId) WHERE DeletedAt IS NULL` | Library list |
| Arrangement `(SongId) WHERE DeletedAt IS NULL` | Song detail |
| Arrangement `(GroupId, Id)` UNIQUE | Composite FK target + scoped get |
| Resource `(ArrangementId)` | Materials list |
| Setlist `(GroupId)` | Template list |
| SetlistItem `(SetlistId, SortOrder)` | Ordered template |
| Event `(GroupId, StartsAt)` partial active | Upcoming events |
| Event `(GroupId, Id)` UNIQUE | Scoped get + child GroupId FKs |
| EventSetlistItem `(EventId, SortOrder)` | Event plan |
| Rsvp `(EventId, UserId)` UNIQUE | Upsert / list |
| Partial unique Arrangement default | One default per Song |

No index on every text column.

---

## 19. Uniqueness strategy

| Candidate | Unique? | Why |
| --------- | ------- | --- |
| Group.Name | No | Multi-Group users; names collide OK |
| Song.Title per Group | No | Covers/duplicates happen |
| Arrangement.Label per Song | No | Soft uniqueness in UX only |
| Resource.Purpose per Arr | No | Multiple audios OK |
| Setlist.Name per Group | No | |
| Event.Title per Group | No | |
| Membership (User, Group) | **Yes** | Domain |
| RSVP (Event, User) | **Yes** | Domain |
| SortOrder per parent | **No** | Reorder simplicity; ORDER BY SortOrder, Id |
| (Parent, ArrangementId) on items | **No** | Duplicates ALLOW |
| Arrangement IsDefault per Song | **No (MVP)** | ADR-0025 removes IsDefault |

---

## 20. Transaction boundaries

| Use-case | Single DB transaction must include |
| -------- | ----------------------------------- |
| Create Arrangement | Insert Arr |
| Soft-delete Song | Song DeletedAt + Version; soft-delete all live Arrangements of Song (+ Versions) |
| Add Resource | Insert metadata after successful blob put **or** put-after-insert with compensating delete — prefer insert row Pending then confirm; MVP: blob then insert in tx around DB only if blob is idempotent key |
| Modify Setlist items | Update Setlist Version + replace/reorder items |
| Modify Event metadata | Event Version |
| **Replace Event Plan** | Event Version check + replace items + SourceSetlistId — atomic (ADR-0021) |
| Soft-delete Arrangement | Arr DeletedAt + Version bump; Resources left in place |
| Soft-delete Song | Song + child Arr soft-delete; Resources left in place |
| Ownership transfer / last-Owner | Membership updates in one tx; enforce ≥1 Owner |
| RSVP | Upsert single row |

**No** custom Unit-of-Work wrapper beyond EF `SaveChanges` / explicit transaction scope in Application handlers.

Blob orphan GC: FUTURE; accept rare orphans if blob succeeds and DB fails (compensate in Application).

---

## 21. EF Core design choices

| Topic | Choice |
| ----- | ------ |
| Global query filters | Yes for Group/Song/Arrangement only; Event path never bypasses for identity |
| IgnoreQueryFilters | Infrastructure-only behind ports |
| Lazy loading | **Off** |
| Eager loading | Explicit `Include` for aggregate children; prefer projections for lists |
| Tracking | Tracking for mutations; `AsNoTracking` for read queries |
| Split queries | Use when Include collections blow up cardinality (Events+items) |
| Compiled queries | Not required for MVP |
| Generic repository | **Unnecessary** |
| Specification pattern | **Unnecessary** |
| Persistence abstraction | Application defines ports where needed (`ISonivoDb` / feature stores); Infrastructure EF implements; **DbContext not referenced from Application** |
| DbContext | One MVP context (Identity + app) |

---

## 22. Performance baseline

| Expectation | Guidance |
| ----------- | -------- |
| Group library size | Hundreds of Songs/Arrangements — simple filtered lists OK |
| Setlist/Event items | Tens, maybe low hundreds — load with parent |
| N+1 risks | Event list + items; Arrangement + Resources — use Include/projection |
| Pagination | Events by date; Songs list — add when UI needs; not every endpoint day one |
| Over-fetch | Do not Include Arrangements on Group |

Correctness > micro-optimization.

---

## 23. Migration strategy (conceptual)

1. Initial migration: Identity tables + all app tables + constraints/indexes/CHECKs.  
2. All schema changes via EF migrations thereafter.  
3. **No** silent destructive prod migrations; expand → migrate data → contract.  
4. Local dev may reset DB; **production may not**.  
5. Do not hand-edit prod schema outside migrations.

**Do not create migrations in Phase 2.2.** (Phase 2.3 `InitialFoundation` and Phase 3.2 `AlignRepertoireToAdr0024And0025` already exist.)

---

## 24. Persistence test strategy (specify only)

Integration tests (Testcontainers Postgres where available) must prove:

1. Membership tenancy: foreign GroupId → no rows / 404 path.  
2. Composite FK rejects SetlistItem / EventSetlistItem with wrong Group Arrangement.  
3. UNIQUE Membership and RSVP.  
4. Soft-delete filters hide Song/Arr; EventSetlistItem + labels remain.  
5. Hard-delete Resource; Event plan unchanged.  
6. Hard-delete Setlist → SourceSetlistId null; items remain.  
7. EventSetlistItem FK Restrict on Arrangement.  
8. Version concurrency → failure on stale Event update / apply.  
9. Replace Event Plan atomic + confirmReplace behavior (Application + DB).  
10. Duplicate SetlistItems allowed.  
11. Cascade Setlist→Items; no cascade Arrangement→EventSetlistItem.  
12. Event GET with soft-deleted Arrangement still returns all EventSetlistItems + Display* (no IgnoreQueryFilters).  
13. Composite FK rejects cross-Group SetlistItem insert.

---

## 25. Failure-scenario review

| # | Scenario | DB | Application | Outcome |
| - | -------- | -- | ----------- | ------- |
| 1 | URL GroupId swap | — | Membership miss | 404 |
| 2 | SetlistItem → foreign Arr | Composite FK fail | Validate Group | Reject |
| 3 | EventSetlistItem → foreign Arr | Composite FK fail | Validate on apply/create | Reject |
| 4 | Song soft-delete | Row remains | Filter + child Arr soft-delete | Library hide; Event labels OK |
| 5 | Arrangement soft-delete | Row remains; Restrict FKs | Filter; Resources left | Tombstone Event lines |
| 6 | Resource delete | Row gone | AuthZ | Plan identity OK |
| 7 | Setlist deleted after apply | SET NULL source | — | Plan intact |
| 8 | Concurrent Event edits | Version | 409 | Loser reloads |
| 9 | Apply vs Event edit | Version on Event | 409 | No partial apply |
| 10 | Dual ownership transfer | Tx + rules | 409/invariant | ≥1 Owner held |
| 11 | Two users RSVP | Two rows | — | Both OK |
| 12 | Same user RSVP twice | UNIQUE upsert | PUT upsert | One row |
| 13 | Duplicate Arr on Setlist | Allowed | Allow | OK |
| 14 | Duplicate SortOrder | Allowed | Reorder rewrite | ORDER BY SortOrder, Id |
| 15 | Arr soft-deleted; still on Setlist | FK OK | Apply fails if still deleted | Template editable; apply blocked |
| 16 | Arr soft-deleted; on Event | FK OK | Event GET without filters bypass | Plan + labels kept |
| 17 | Stale signed URL after Resource delete | — | Object missing | Fails after TTL/window |
| 18 | Group soft-delete | DeletedAt | 404 all Group routes | Hidden |
| 19 | FUTURE restore/purge Song | — | Explicit FUTURE | Not MVP |
| 20 | Setlist delete after Event create | SET NULL | — | Same as 7 |
| 21 | Attach Group A Arr to Group B Setlist | Composite FK fail | Reject | Both layers |
| 22 | Stale expectedVersion on Event PATCH | Version WHERE | 409 | No overwrite |

---

## 26. ADR discipline

| Topic | Status |
| ----- | ------ |
| ADR-0022 | **ACCEPTED** HUMAN-APPROVED 2026-09-15 |
| ADR-0023 | **ACCEPTED** HUMAN-APPROVED 2026-09-15 |
| integer Version concurrency | **ACCEPTED** (documented here; no separate ADR) |

---

## 27. Experiments (later — do not run now)

- EF Core alternate-key + composite FK mapping for Npgsql  
- Confirm required-nav + query filter does **not** appear on Event configurations (regression test)  
- ~~Partial unique index for Arrangement `IsDefault`~~ — removed from MVP (ADR-0025)
