# GLOSSARY.md — Sonivo

Working ubiquitous language. ACCEPTED ADRs 0005–0018.

| Term | Meaning | Status |
| ---- | ------- | ------ |
| **Group** / **Membership** / **Owner** / **Member** | Tenant; association; roles | FACT |
| **Song** | Work identity; may have zero Arrangements | FACT |
| **Arrangement** | Playable realization; owns Resources | FACT |
| **Resource** | file\|link; purpose `chart`\|`lyrics`\|`audio`\|`click`\|`reference`\|`other` | FACT |
| **Setlist** / **SetlistItem** | Reusable template lines | FACT |
| **Event** | Occurrence; type rehearsal\|performance\|other | FACT |
| **EventSetlistItem** | Event-owned planned line; frozen order/overrides/`ArrangementId` + copied `displaySongTitle` / `displayArrangementLabel` | FACT |
| **Tombstone (Event)** | Identity labels when Arrangement soft-deleted — not a content snapshot | FACT |
| **sourceSetlistId** | Optional provenance; nulled if template deleted | FACT |
| **RSVP / Attendance** | Event participation history | FACT |
| **Snapshot / versioning** | Full past Arrangement/Resource state — OUT OF MVP | OUT |

Update when ADRs change.
