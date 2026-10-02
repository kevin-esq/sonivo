# GLOSSARY.md — Sonivo

Working ubiquitous language. ACCEPTED ADRs 0005–0025.

| Term                                                | Meaning                                                                                               | Status       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------ |
| **Group** / **Membership** / **Owner** / **Member** | Tenant; association; roles                                                                            | FACT         |
| **Song**                                            | Group-scoped musical **work identity**; may have zero Arrangements                                    | FACT         |
| **Arrangement**                                     | Group-scoped **performable realization** of a Song; owns body + Resources                             | FACT         |
| **Song Title**                                      | Required display name; duplicates within Group **ALLOWED** (ADR-0025)                                 | FACT         |
| **Attribution**                                     | Optional free-text composer/artist/source credit on Song (ADR-0025)                                   | FACT         |
| **OriginKind**                                      | `original` \| `cover` \| `other` on Song (ADR-0025)                                                   | FACT         |
| **RightsNotes**                                     | Optional free-text usage/rights reminder on Song — not a licensing system (ADR-0025)                  | FACT         |
| **Arrangement Label**                               | Required human label for a realization; not unique (ADR-0025)                                         | FACT         |
| **DefaultKey / DefaultBpm**                         | Optional Arrangement defaults; key free text; BPM optional int 1–400 (ADR-0025)                       | FACT         |
| **Resource**                                        | Arrangement material: kind `file`\|`link`; purpose enum; required Label; optional Part; optional note | FACT         |
| **Resource purpose**                                | `chart`\|`lyrics`\|`audio`\|`click`\|`reference`\|`practice`\|`other`                                 | FACT         |
| **Part (Resource metadata)**                        | Optional free-text musical part; not a domain aggregate                                               | FACT         |
| **Setlist** / **SetlistItem**                       | Reusable template lines (live Arrangement refs + overrides)                                           | FACT         |
| **Event** / **EventSetlistItem**                    | Occurrence; frozen plan + copied identity labels                                                      | FACT         |
| **Tombstone (Event)**                               | Identity labels when Arrangement soft-deleted — not a content snapshot                                | FACT         |
| **IsDefault**                                       | Preferred Arrangement flag — **OUT OF MVP** (ADR-0025)                                                | OUT / FUTURE |
| **Member → Part assignment**                        | OUT OF MVP                                                                                            | OUT / FUTURE |
| **Arrangement version history / duplicate**         | OUT OF MVP                                                                                            | OUT / FUTURE |
| **Practice player**                                 | IN (Wave 2 Arrangement; Wave 3 Event/Setlist queue)                                                   | ADR-0029     |
| **White label (group branding)**                    | Per-group name, logo, accent, cover, theme, copy stored server-side (`GroupBranding`)                 | PROPOSED (ADR-0048) |
| **Member roster**                                   | The people of a group; the unified `Membership` row, which may have no linked `UserId`                | PROPOSED (ADR-0046) |
| **Managed account**                                 | Account created by a group and resettable by that Owner while `ManagedByGroupId` matches               | PROPOSED (ADR-0046/0047) |
| **Activation link**                                 | Single-use, expiring link that lets a member set their own credential (used when an email exists)      | PROPOSED (ADR-0047) |
| **Temporary password / MustChangePassword**          | One-time credential shown once, plus a server-enforced flag that blocks the API until changed         | PROPOSED (ADR-0047) |
| **Handle**                                          | The access identifier of an account without email; stored separately from `GroupId`                    | PROPOSED (ADR-0046) |
| **Public host / tenant host**                       | The DNS host that serves a group's branded surface; resolved from `GroupDomain`                        | PROPOSED (ADR-0049) |
| **One-time code (exchange)**                        | Short-lived, host-bound, single-use code that turns a central-auth session into a host-only session    | PROPOSED (ADR-0049) |

Update when ADRs change.
