# PERSONAS.md — Sonivo

Role-based personas. **ADR-0006 ACCEPTED.** No fictional demographics.

**Phase 1 CLOSED:** Member remains read-focused for musical content; RSVP is the intentional write exception (ADR-0012).

---

## Primary: Group Organizer

**Also appears as:** owner, band manager, music director, choir director, worship leader, lead artist-operator.

| Dimension | Detail |
| --------- | ------ |
| **Goals** | Current repertoire; prepared rehearsals/gigs; right charts/audio; controlled membership |
| **Jobs** | Maintain library; arrangements; setlists; events; invites; resources |
| **Frustrations** | Drive/chat chaos; church-only or DAW-heavy tools |
| **Permissions** | Owner role (ADR-0012) |
| **Context** | Desktop-first prep; phone for checks |
| **Buyer** | Usually yes for small/medium groups |
| **Product role** | Acquisition, empty states, IA, admin |

---

## Secondary: Member / Musician

| Dimension | Detail |
| --------- | ------ |
| **Goals** | Know what to play; open correct arrangement materials; see schedule |
| **Jobs** | View setlists/events; open resources; RSVP |
| **Frustrations** | Wrong version; admin-heavy apps |
| **Permissions** | View content + RSVP; **no** core musical mutation in MVP |
| **Context** | Mobile-heavy at rehearsal |
| **Product role** | **First-class** read/use UX — retention critical (ADR-0006) |

**Challenge (survived):** Crowdsourced Member edits would help some bands but explode AuthZ and conflict with Owner-as-operator MVP. Defer Member writes to **FUTURE**.

---

## Guest / Session (provisional)

| Dimension | Detail |
| --------- | ------ |
| **Status** | **Not required** as full MVP capability (ADR-0006) |
| **If later** | Time-boxed, least privilege |

---

## Buyer vs user

| | |
| --- | --- |
| Buyer / operator | Group Organizer |
| End user by headcount | Member |

---

## Non-personas

Congregation/audience · church admins (giving/CRM) · social listeners · DAW engineers as primary users
