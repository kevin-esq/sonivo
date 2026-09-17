# TECHNICAL-SPEC.md — Sonivo

Technical specification derived from ACCEPTED domain and architecture (ADR-0005–0023).  
**Phase 2.0–2.2 CLOSED.** **No code.**

Companion: [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`PERSISTENCE.md`](PERSISTENCE.md) · [`API.md`](API.md) · [`SECURITY.md`](SECURITY.md) · [`TESTING.md`](TESTING.md)

---

## 1. Aggregate + persistence mapping

**Authoritative column/FK/cascade detail:** [`PERSISTENCE.md`](PERSISTENCE.md) (Phase 2.2 **CLOSED**).  
**PK strategy:** `uuid` / `Guid`; **application-generated** (default v4).  
**Tenant column:** `GroupId` per PERSISTENCE §3 (not on Resource/RSVP).  
**Cross-Group DB protection:** three composite FKs **ON DELETE RESTRICT** (ADR-0022 **ACCEPTED**).  
**Concurrency:** `integer Version` (init 1; increment on protected mutations) → `expectedVersion` / **409**; response returns new `version`.  
**Soft-delete filters:** Group/Song/Arrangement; Event history filter-independent (ADR-0023 **ACCEPTED**). Arrangement soft-delete does **not** delete Resources/blobs.

| Concept | Kind | Root / owner | Group scope | FKs | Cardinality | Delete | Direct query | Direct mutate |
| ------- | ---- | ------------ | ----------- | --- | ----------- | ------ | ------------ | ------------- |
| **User** | Aggregate (Identity) | User | N/A | — | 1 User : N Memberships | Identity rules; account-deletion OPEN | Via Identity / CurrentUser | Via Identity flows |
| **Group** | Aggregate root | Group | self | — | — | Soft-delete | Yes (membership-scoped) | Owner |
| **Membership** | Entity | Group | Group | UserId, GroupId | User N:N Group; unique (UserId,GroupId) | Remove membership | Yes | Owner (+ leave) |
| **Song** | Aggregate root | Song | Group | GroupId | Group 1:N Song | Soft-delete | Yes | Owner |
| **Arrangement** | Aggregate root | Arrangement | Group | GroupId, SongId | Song 1:N Arr; Group 1:N Arr | Soft-delete | Yes | Owner |
| **Resource** | Entity | Arrangement | via Arr | ArrangementId | Arr 1:N Res | Hard-delete | Via Arrangement | Owner |
| **Setlist** | Aggregate root | Setlist | Group | GroupId | Group 1:N | Hard-delete | Yes | Owner |
| **SetlistItem** | Entity | Setlist | via Setlist | SetlistId, ArrangementId | Setlist 1:N Item; Arr may repeat | With Setlist / item edit | Via Setlist | Owner |
| **Event** | Aggregate root | Event | Group | GroupId; sourceSetlistId? | Group 1:N | Cancel + soft-hide | Yes | Owner |
| **EventSetlistItem** | Entity | Event | via Event | EventId, ArrangementId | Event 1:N; Arr may repeat | With Event item edit / replace-on-apply | Via Event | Owner |
| **RSVP** | Entity | Event | via Event | EventId, UserId | unique (EventId, UserId) | Update status | Via Event | Owner+Member |

### Aggregate challenge notes

- **Membership** is not its own root; consistency with “≥1 Owner” is **Application** + transaction.  
- **Resource** stays inside Arrangement consistency boundary (ADR-0014).  
- **SetlistItem** / **EventSetlistItem** are not roots; duplicates allowed → **no** unique (parent, ArrangementId).  
- **User** remains Identity-owned; domain references `UserId` only.  

**EventSetlistItem columns (ACCEPTED 0018):** Id, EventId, ArrangementId, DisplaySongTitle, DisplayArrangementLabel, SortOrder, override fields (Key?, Bpm?, Capo?, Notes?), timestamps.  
**sourceSetlistId:** nullable Guid on Event; set null when template deleted.

---

## 2. Invariant enforcement matrix

| Invariant | Domain | Application | Database | API |
| --------- | ------ | ----------- | -------- | --- |
| Membership in exactly one Group row per pair | — | Enforce unique join | UNIQUE (UserId, GroupId) | 409 on conflict |
| User multi-Group | — | Allow | No unique on User alone | — |
| Roles Owner\|Member only | Enum / type | Reject others | CHECK / enum | 400 |
| ≥1 Owner while Group exists | Prefer domain service | **Canonical** on leave/demote/remove | Optional deferrable check | 409 |
| Owner transfer / promote | — | **Canonical** | — | 403/409 |
| Member cannot Owner ops | — | **Canonical** AuthZ | — | 403 |
| Arrangement one Song + one Group | Ctor invariants | Verify Song.GroupId == Arr.GroupId | FKs + app check | 400 |
| Resource one Arrangement | Parent required | — | FK | 400 |
| Setlist one Group | — | — | FK | — |
| SetlistItem Arr same Group | — | **Canonical** | Composite FK `(GroupId, ArrangementId)` RESTRICT (0022) | 400 |
| Duplicate SetlistItems allowed | — | Allow | **No** unique (Setlist,Arr) | — |
| EventSetlistItem one Event | Parent | — | FK | — |
| Copied display labels present | Prefer require non-empty | Set on create/apply | NOT NULL | 400 |
| No cross-Group refs | — | **Canonical** | Composite FKs (0022) + App | 404/403 |
| Event valid after Setlist delete | — | Null sourceSetlistId | ON DELETE SET NULL | — |
| Song may have 0 Arrangements | Allow | Allow last Arr delete | No “≥1 Arr” constraint | — |
| Overrides don’t mutate Arrangement | Separate models | Write only Event/Setlist items | Separate tables | — |
| Soft-deleted Group inaccessible | — | Filter + AuthZ | `DeletedAt` filter | 404 |
| Soft-deleted Arr still referenced by Event items | Keep FK | Tombstone UX | FK retained; no cascade | 200 with unavailable |

**Canonical enforcement** for tenancy + AuthZ + cross-aggregate rules: **Application**.  
**Database** backs uniqueness/FKs. **API** validates shape only. **Domain** owns single-aggregate consistency.

---

## 3. Multi-tenancy / Group isolation (**ACCEPTED ADR-0019**)

**Principle:** CLIENT-SUPPLIED GROUP ID ≠ AUTHORIZATION. Full flow: [`SECURITY.md`](SECURITY.md) §3.

- Route `groupId` is a **claim**; Membership at Application entry authorizes.  
- No trusted Group header. Non-member → **404**; member wrong role → **403**.  
- Tenant loads: `(GroupId, EntityId)` only.  
- Object keys: `groups/{groupId}/...` after AuthZ.  
- No Postgres RLS in MVP.

### Cross-aggregate tenancy matrix

| Operation | Group source | Membership | Cross-group validation | DB |
| --------- | ------------ | ---------- | ---------------------- | -- |
| Create Song | Route claim → verified membership | Required | — | Insert with GroupId |
| Create Arrangement | Route + Song.GroupId must match route | Required | Song in same Group | Insert GroupId + SongId |
| Add Resource | Route + Arrangement.GroupId | Required | Arrangement in Group | Insert under Arrangement |
| Create SetlistItem | Route + Setlist.GroupId | Required | Arrangement in **same** Group | FK + app check |
| Create Event | Route claim | Required | — | Insert GroupId |
| Replace Event Plan (apply) | Route; Event.GroupId; Setlist.GroupId | Owner | Every Arrangement same Group; not soft-deleted | Tx replace items |
| RSVP | Route + Event.GroupId | Member | Event in Group | Upsert RSVP |
| Update Arrangement | Route + Arrangement.GroupId | Owner | — | Scoped update |
| Delete Arrangement | Route + Arrangement.GroupId | Owner | — | Soft-delete Arr; Resources left in place |
| Ownership transfer | Route Group | Owner | Target User becomes Member/Owner in **this** Group only | Membership rows |

**Derive GroupId from:** verified route claim + loaded aggregate’s GroupId (must agree). Never from related entity alone without re-check.

**Confidence:** HIGH.

---

## 4. Concurrency (Version ACCEPTED; apply per ADR-0021)

| Resource | Mechanism |
| -------- | --------- |
| Group, Song, Arrangement, Setlist, Event | `Version` init **1**; increment on protected mutations |
| Replace Event Plan / ownership / last-Owner | Single DB transaction; Event `expectedVersion` required on apply |
| Arrangement edit vs Event prep | Allowed; plan labels/overrides are Event-owned copies (ADR-0018) |
| Setlist edit during apply (A) | Apply reads committed Setlist items inside tx; no Setlist revision table |
| Event edit during apply (B) | Event Version → loser **409** |
| Arrangement soft-delete during apply (C) | Re-validate in tx → fail apply |
| Arrangement title change during apply (D) | Labels taken from names read in tx (current at apply) |
| Dual apply (E) | Event Version → one succeeds |

API: send `expectedVersion`; success includes new `version`; stale → **409**; never silent overwrite. Details: [`PERSISTENCE.md`](PERSISTENCE.md) §6.

---

## 5. Delete / soft-delete technical semantics

| Entity | Meaning | Default queries | API | FKs | History |
| ------ | ------- | --------------- | --- | --- | ------- |
| Group | `DeletedAt` set | Exclude | 404 | Dependents inaccessible | N/A |
| Song | `DeletedAt` | Exclude from library | 404 | Soft-delete child Arrangements (App) | Event items keep labels |
| Arrangement | `DeletedAt` | Exclude from library | 404 | Resources **left in place**; EventSetlistItem FK remains | Tombstone via Display* |
| Resource | Row removed (explicit DELETE) | Gone | 204 | — | Not historical |
| Setlist | Row removed | Gone | 204 | Event.sourceSetlistId SET NULL | Event items remain |
| Event | `Cancelled` + soft-hide | Exclude from active lists; Owner may view cancelled | 404 for non-members / hidden | Items retained | Full plan retained |

**Do not hard-delete Events in MVP.**  
**EventSetlistItem → ArrangementId:** keep FK; no ON DELETE CASCADE.  
**Event GET** never requires `IgnoreQueryFilters` for plan identity ([`PERSISTENCE.md`](PERSISTENCE.md) §2.2).

---

## 6. Replace Event Plan from Setlist (**ACCEPTED ADR-0021**)

### Canonical semantic

**Import/copy with full replace** — not sync, not append, not merge.  
UX/docs name: **Replace Event Plan from Setlist**. Route may stay `POST .../apply-setlist`.

### Behavior (one transaction)

1. AuthZ: Owner + membership; Event `expectedVersion` must match.  
2. Load Event (`GroupId`, not cancelled).  
3. Load Setlist (same `GroupId`).  
4. If Event already has ≥1 EventSetlistItem and body lacks `confirmReplace: true` → **409** (no write).  
5. Each template Arrangement: exists, same Group, **not** soft-deleted → else **400/409** (no partial write).  
6. Delete all EventSetlistItems for Event.  
7. Insert copies: ArrangementId, order, template overrides; `displaySongTitle` / `displayArrangementLabel` from **current** names.  
8. `sourceSetlistId = Setlist.Id` (provenance).  
9. Commit.

### Re-apply

Allowed with confirmation when items exist. Custom order/overrides/manual adds are **discarded**. Outcome tracks **current template**, not prior Event plan.

### Alternatives (Phase 2.1 challenge)

| Option | Verdict |
| ------ | ------- |
| A Replace | **Chosen** — predictable template→plan |
| B Append | Rejected — duplicate/confusing plans |
| C Merge | Rejected — ambiguous; hides data loss |
| D Snapshot-only | N/A — copy already; does not define re-apply |
| E Explicit Replace Event Plan | **Naming** of A — required in docs/UX |

### Historical integrity (unchanged ACCEPTED 0018)

| Rule | Still intact? |
| ---- | ------------- |
| EventSetlistItem keeps ArrangementId + display labels + order + overrides | Yes after apply |
| Delete Setlist | Yes — null `sourceSetlistId`; items remain |
| Soft-delete Song/Arrangement | Yes — tombstone labels; no cascade wipe of Event items |
| Rename Arrangement after Event plan created | Yes — Event display labels stay until replace |
| Delete Resource | Yes — plan identity unaffected |

No content snapshots.

### Failure / retry

Validation/concurrency → no partial write; client reload; no server auto-retry.

**Confidence:** HIGH on replace; MEDIUM-HIGH that `confirmReplace` is the right footgun guard.

---

## 7. Object storage (**PROPOSED**; vendor OPEN)

| Concern | Rule |
| ------- | ---- |
| Metadata | Resource row in Postgres (purpose, note, contentType, size, objectKey, ArrangementId) |
| Bytes | Object store via `IBlobStore` port |
| Key | `groups/{groupId}/arrangements/{arrangementId}/{resourceId}/{safeFileName}` |
| Upload | Owner; authenticated; size/type limits (limits OPEN numeric — assume sensible defaults e.g. 50MB audio, 10MB docs until product sets) |
| Download | Member+Owner of Group; authorize then signed URL **or** authenticated proxy (PROPOSED prefer **signed URL** short TTL after AuthZ) |
| Public URLs | **Forbidden** for MVP Resources |
| Delete | Hard-delete DB row + best-effort blob delete; orphan GC FUTURE |
| Filename | Sanitize; store original display name separately if needed |

Not a DAM. **Confidence:** HIGH on abstraction; MEDIUM on size limits until product sets numbers.

---

## 8. Error model (**PROPOSED**)

Use **RFC 9457 Problem Details** (`application/problem+json`):

| Situation | Status | title / type |
| --------- | ------ | ------------ |
| Validation | 400 | validation-error (+ errors[]) |
| Unauthenticated | 401 | unauthorized |
| Forbidden (member of group but role) | 403 | forbidden |
| Not member / missing | 404 | not-found |
| Conflict (owners, concurrency, apply) | 409 | conflict |
| Domain rule | 422 or 409 | domain-rule (prefer **409** for invariant conflicts, **400** for bad input) |
| Unexpected | 500 | internal (no internals leaked) |

**Confidence:** HIGH.

---

## 9. Observability minimum (**PROPOSED**)

- Structured logs (JSON) with `requestId` / correlation id middleware  
- Log: AuthN failures, AuthZ denials, domain conflicts, unhandled exceptions  
- No Sentry required for MVP scaffold  
- Retention/hosting OPEN  

---

## 10. Frontend architecture (**PROPOSED**)

| Concern | Choice |
| ------- | ------ |
| Routing | React Router (or Vite-friendly router) |
| Auth state | Session via `GET /api/auth/me`; cookie credentials `include` |
| Current Group | Client route `/g/:groupId/...` mirroring API; server still AuthZ |
| API client | Thin fetch/openapi client module; no business rules |
| Server state | Prefer React Query **or** plain fetch + local state — **PROPOSED:** start with **fetch + React state**; add TanStack Query only if caching pain appears |
| Forms / validation | Client UX validation + server Problem Details |
| Optimistic updates | Avoid for AuthZ-sensitive mutations in MVP |
| a11y | Keyboard, labels, contrast; Impeccable when UI work starts |

**Confidence:** MEDIUM–HIGH on “no required global store”.

---

## 11. Technical open questions (classification)

| Item | Classification |
| ---- | -------------- |
| Q8 chart format | Blocks **chart editing UX** only; scaffold OK with opaque text/blob |
| Q9 realtime | Deferred safely |
| Q10 billing | Deferred; no payment code |
| Q11 mobile/PWA | Deferred; web MVP |
| Account deletion | Blocks **account deletion feature** only |
| Hosting | Blocks **deploy**; not local scaffold |
| Invite mechanics | Blocks **invite feature**; can scaffold Group create + manual Membership seed in tests |
| Blob vendor | Blocks **prod files**; local filesystem adapter OK for early dev |
| Numeric upload limits | Product polish; pick defaults |

---

## 12. Experiments (document only — do not run)

- Cookie + Vite proxy SameSite behavior on target browsers  
- Antiforgery header flow with SPA  
- Signed URL expiry UX for audio streaming  

---

## 13. What should / should not be ADRs

| Become ADR | Stay in this spec |
| ---------- | ----------------- |
| Tenancy / CSRF / Replace Event Plan — **done** (0019–0021 ACCEPTED) | Error field shapes |
| Cross-Group composite FKs / soft-delete filters — **done** (0022–0023 ACCEPTED) | Log field names |
| — | Default upload MB caps until product sets |
| — | React Query yes/no |
