# DOMAIN-MODEL.md — Sonivo

Domain model for MVP. **ACCEPTED** ADRs 0005–0008, 0012–0014, and Phase 1 package **0015–0018** (HUMAN-APPROVED Phase 1 closure).

Conflict reading order: **0018 > 0017 > 0016 > 0015**.

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

EventSetlistItem stores `ArrangementId`, `displaySongTitle`, `displayArrangementLabel`, order, overrides. Soft-deleted Arrangement → tombstone from copied labels. **Not** a content snapshot.

---

## 3. sourceSetlistId

Provenance only; null if template deleted. Event plan remains complete.

---

## 4. Accepted Phase 1 rules (summary)

Resource purposes: `chart`\|`lyrics`\|`audio`\|`click`\|`reference`\|`other`  
Duplicates ALLOW · copy-on-apply · Event types rehearsal\|performance\|other · Q21/Q22 FUTURE · zero Arrangements ALLOW · Resource hard-delete · no cross-Group refs

---

## 5. Decision matrix (Phase 1 CLOSED)

| Decision | Status |
| -------- | ------ |
| Song / Arrangement split | ACCEPTED (0007) |
| Arrangement aggregate root | ACCEPTED (0014) |
| Resource on Arrangement | ACCEPTED (0008) |
| Owner \| Member | ACCEPTED (0012) |
| Group tenancy / lifecycle | ACCEPTED (0005, 0013) |
| Library-anchored Event loop | ACCEPTED (0015–0017) |
| Resource purpose 6-value enum | ACCEPTED (0017) |
| Duplicate items ALLOW | ACCEPTED (0016) |
| Setlist→Event copy-on-apply | ACCEPTED (0016) |
| Event types | ACCEPTED (0016) |
| History plan frozen; body/resources live | ACCEPTED (0016–0018) |
| Copied Event identity labels | ACCEPTED (0018) |
| No content versioning | ACCEPTED |
| Song may have zero Arrangements | ACCEPTED (0017) |
| Soft/hard delete rules as documented | ACCEPTED (0016–0017) |
| Duration/transitions; Arrangement status | FUTURE |
| Q8–Q11, account deletion, CSRF, hosting | OPEN |

---

## 6. OUT OF SCOPE (reaffirm)

Versioning/snapshots · DAM · chat · PM · ACL engines · Recording/Performance aggregates · Organization · Guest · billing · analytics · notifications · mobile-specific domain
