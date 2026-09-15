# GLOSSARY.md — Sonivo

Working ubiquitous language. ACCEPTED ADRs 0005–0025.

| Term | Meaning | Status |
| ---- | ------- | ------ |
| **Group** / **Membership** / **Owner** / **Member** | Tenant; association; roles | FACT |
| **Song** | Group-scoped musical **work identity**; may have zero Arrangements | FACT |
| **Arrangement** | Group-scoped **performable realization** of a Song; owns body + Resources | FACT |
| **Song Title** | Required display name; duplicates within Group **ALLOWED** (ADR-0025) | FACT |
| **Attribution** | Optional free-text composer/artist/source credit on Song (ADR-0025) | FACT |
| **OriginKind** | `original` \| `cover` \| `other` on Song (ADR-0025) | FACT |
| **RightsNotes** | Optional free-text usage/rights reminder on Song — not a licensing system (ADR-0025) | FACT |
| **Arrangement Label** | Required human label for a realization; not unique (ADR-0025) | FACT |
| **DefaultKey / DefaultBpm** | Optional Arrangement defaults; key free text; BPM optional int 1–400 (ADR-0025) | FACT |
| **Resource** | Arrangement material: kind `file`\|`link`; purpose enum; required Label; optional Part; optional note | FACT |
| **Resource purpose** | `chart`\|`lyrics`\|`audio`\|`click`\|`reference`\|`practice`\|`other` | FACT |
| **Part (Resource metadata)** | Optional free-text musical part; not a domain aggregate | FACT |
| **Setlist** / **SetlistItem** | Reusable template lines (live Arrangement refs + overrides) | FACT |
| **Event** / **EventSetlistItem** | Occurrence; frozen plan + copied identity labels | FACT |
| **Tombstone (Event)** | Identity labels when Arrangement soft-deleted — not a content snapshot | FACT |
| **IsDefault** | Preferred Arrangement flag — **OUT OF MVP** (ADR-0025) | OUT / FUTURE |
| **Member → Part assignment** | OUT OF MVP | OUT / FUTURE |
| **Arrangement version history / duplicate** | OUT OF MVP | OUT / FUTURE |
| **Practice player** | OUT OF MVP | OUT / FUTURE |

Update when ADRs change.
