# DOMAIN-MODEL.md — Sonivo

Domain model for MVP. **ACCEPTED** ADRs 0005–0008, 0012–0014, Phase 1 **0015–0018**, persistence/security **0019–0023**, rehearsal Resources **0024**, Song/Arrangement fields **0025**.

Conflict reading order (ACCEPTED): **0025 > 0024 > 0023 > 0022 > … > 0018 > 0017 > 0016 > 0015**.

**Not** EF / SQL / APIs.

---

## 1. Final MVP domain spine

| Concept | Purpose | Aggregate / relationship | Scope | Historical vs live |
| ------- | ------- | ------------------------ | ----- | ------------------ |
| **Group** | Tenant / musical team | Tenant root | Group | Soft-delete hides all |
| **Membership** | User↔Group + role | Entity on Group | Group | — |
| **Song** | Work identity | Aggregate root | Group | Soft-delete; may have 0 Arrangements |
| **Arrangement** | Playable realization | Aggregate root (`SongId`) | Group | Soft-delete; **body live** when open |
| **Resource** | file\|link material | Entity on Arrangement | Arrangement | Hard-delete; **not** on Event history |
| **Setlist** | Reusable template | Group collection | Group | Hard-delete OK |
| **SetlistItem** | Template line | Child of Setlist | Group | Not historical |
| **Event** | Occurrence | Aggregate root | Group | Metadata **frozen**; cancel+soft-hide |
| **EventSetlistItem** | Planned line that night | Child of Event | Event | **Frozen** plan + **copied identity labels** |
| **RSVP / Attendance** | Participation | Child of Event | Event | **Frozen** |

**Value:** Prepare the next musical event.

---

## 2. Historical identity / tombstones (ADR-0018)

EventSetlistItem stores `ArrangementId`, `displaySongTitle`, `displayArrangementLabel`, order, overrides. Soft-deleted Arrangement → tombstone from copied labels. **Not** a content snapshot. **No** ResourceIds on Event lines (ADR-0024).

---

## 3. sourceSetlistId

Provenance only; null if template deleted. Event plan remains complete.

---

## 4. Accepted Phase 1 rules (summary)

Resource purposes (ADR-0017 revised by **0024**): `chart`\|`lyrics`\|`audio`\|`click`\|`reference`\|`practice`\|`other`  
Duplicates ALLOW · copy-on-apply · Event types rehearsal\|performance\|other · Q21/Q22 FUTURE · zero Arrangements ALLOW · Resource hard-delete · no cross-Group refs

---

## 5. Song & Arrangement (ACCEPTED — ADR-0025)

### Song

```text
Song
├── GroupId
├── Title          (required, non-blank; duplicates within Group ALLOWED)
├── Attribution    (optional free text)
├── OriginKind     (original | cover | other)
├── RightsNotes    (optional free text)
├── Version
└── DeletedAt      (soft-delete)
```

- Identity = `SongId` in Group; **not** a global catalog entry.  
- Variants (“Imagine — live acoustic”) are **Arrangements**, not separate Songs, when they share the same work.  
- Soft-delete Song → Application soft-deletes all **live** Arrangements in **one transaction** (Song `expectedVersion` required; Arr Versions bumped server-side; stale/conflict → **409** full rollback). Resources left; Events keep copied labels. **No restore MVP.** Already-soft-deleted Arrangements unchanged.

### Arrangement

```text
Arrangement
├── GroupId + SongId   (composite FK; immutable lineage)
├── Label              (required, non-blank; not unique per Song)
├── DefaultKey         (optional free text)
├── DefaultBpm         (optional int 1–400)
├── Lyrics             (optional plain text)
├── Chords             (optional plain text)
├── Structure          (optional plain text)
├── Notes              (optional plain text)
├── Resources[]        (ADR-0024)
├── Version
└── DeletedAt
```

- Identity = `ArrangementId`. **No `IsDefault`.** UI lists by Label; Setlist/Event pick ArrangementId explicitly.  
- Soft-delete Arr → Resources remain; Setlist/Event FKs remain; cannot **add** deleted Arr to Setlist; Apply fails if template has deleted Arr. **No restore MVP.**  
- Edits mutate live library in place; past Events do not rewrite (0018). No version history; Duplicate Arrangement = FUTURE.

### Responsibility matrix

| Rule | Domain | Application | Database | API |
| ---- | ------ | ----------- | -------- | --- |
| Title / Label non-blank | Yes | Yes | CHECK / NOT NULL | 400 |
| Max string lengths | — | — | Yes | 400 |
| OriginKind enum | Yes | Yes | CHECK | 400 |
| BPM range when set | Yes | Yes | CHECK | 400 |
| Duplicate titles ALLOWED | Yes | — | **no** unique | — |
| Same-Group Song↔Arr | — | AuthZ + set GroupId | Composite FK | — |
| Membership / Owner mutate | — | Yes | — | 403 |
| Soft-delete visibility | — | Filters via Infra | DeletedAt + EF filter | 404 |
| expectedVersion → 409 | — | Yes | Version column | 409 |
| Song DELETE cascade | — | One tx; Song expectedVersion only | Concurrency tokens | 409 |
| Soft-deleted Arr on Setlist add / apply | — | Reject | FK still valid | 400/409 |
| Client GroupId for AuthZ | — | **Never trust** | — | — |

---

## 6. Rehearsal / practice materials (ACCEPTED — ADR-0024)

```text
Resource
├── Kind: file | link
├── Purpose: chart | lyrics | audio | click | reference | practice | other
├── Label: required
├── Part: optional free text (at most one)
└── Note: optional
```

---

## 7. Decision matrix

| Topic | Status |
| ----- | ------ |
| Resource on Arrangement | ACCEPTED (0008/0024) |
| Song/Arrangement field model | **ACCEPTED (0025)** |
| First-class Part entity | REJECTED MVP (0024) |
| Arrangement version history | FUTURE |
| Song title uniqueness | **ALLOW duplicates (0025)** |
| IsDefault | **OUT OF MVP (0025)** |

---

## 8. MVP vs FUTURE (Song / Arrangement)

| Capability | MVP | Future |
| ---------- | --- | ------ |
| Songs / multi-Arr / Labels / Key / BPM / lyrics/chords/structure/notes / Resources | Yes | — |
| Arrangement duplication / version history | No | Yes / maybe |
| IsDefault / preferred Arrangement | No | Maybe |
| Transposition / notation / structured sections / tags | No | Maybe |
| Search | List/filter | Full search |
| Soft-delete restore | No | Maybe |
