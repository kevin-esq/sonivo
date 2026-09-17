# System-close plan — Sonivo

**Status:** Gate A **AUTHORIZED** 2026-09-17 (Kevin Esquivel). Phase 3.7–3.9 and T-OPS-01 **COMPLETED** on `develop`. Remaining Gate A ops: **T-OPS-02**. Do **not** start Gate B.  
**Date:** 2026-09-17  
**Live:** https://sonivo.onrender.com (Free Render + Neon; branch `develop`)  
**Depends on:** ADR-0005–0006, 0012–0013, 0015–0021; Phases 3.2–3.6 **COMPLETED** on `develop`.

This plan does **not** reopen ACCEPTED ADRs. It does **not** authorize T-3.2.06 or merge to `main`. Invite email (3.9, Gmail API HTTPS) stays optional and separate.

---

## Two gates (do not collapse)

| Gate | Name | Meaning | When |
| ---- | ---- | ------- | ---- |
| **A** | **Sistema funcional** | The MVP loop works end-to-end with the **current** UI: an Owner can prepare the next event; a Member can join, read the plan, and RSVP; people can be listed and removed. | **This plan.** Stay on `develop`. |
| **B** | **Cierre de producto** | Gate A **plus** frontend redesign **plus** merge to `main` **plus** treat the public URL as the product. | **After** Gate A. Not before. |

**FACT:** Gate B is explicitly **later**. The system is not “closed completely” until the UI is redesigned — but that redesign **must not** start until Gate A is complete and functional.

```text
Gate A (People + invite hygiene + ops that keep live usable)
    → UI redesign (Gate B start)
    → merge main
    → public prod cut
```

---

## Gate A — definition of done

An organizer can, **without SQL**, on local and on the live URL:

1. Register / log in; create a Group.
2. Build Library: Song → Arrangement → **link** Resource.
3. Build a Setlist; create an Event; apply the Setlist (copied plan).
4. Invite a second User via **link**; they join as Member.
5. **See who is in the Group**; remove a Member; promote/demote Owner↔Member; leave (ADR-0013).
6. Rename or soft-delete the Group (Owner); last-Owner rules hold.
7. Member reads Library + Event plan (no mutate chrome); RSVP yes/no/maybe; Owner sees attendance.
8. Owner corrects Event title/type/startsAt or cancels (soft-hide).

**Not required for Gate A:** file uploads, email, Event location/notes, roster-on-item, billing, native app, ChordPro, merge `main`.

**Already true after 3.8 + T-OPS-01 + 3.9:** 1–8 plus optional invite email. Invite list/revoke and DataProtection keys are in.

---

## Sequence (authorize one slice at a time)

Each remaining slice still needs a thin spec + Kevin authorization before code. Same loop: implement → audit → approve → git → PR `develop` → CI → merge. **Do not merge `main` in Gate A.**

### Phase 3.7 — Thin People + Group lifecycle (COMPLETED)

**Product bet:** “Your people” is first-class. Invite without a roster is a dead end.

Routes already sketched in [`API.md`](../03-architecture/API.md) (not implemented):

| Method | Route | AuthZ |
| ------ | ----- | ----- |
| GET | `/api/groups/{groupId}/members` | Member |
| DELETE | `/api/groups/{groupId}/members/{userId}` | Owner (ADR-0013) |
| POST | `/api/groups/{groupId}/members/{userId}/role` | Owner (ADR-0013) |
| POST | `/api/groups/{groupId}/leave` | Member/Owner; last Owner **409** |

Group `PATCH` / `DELETE` already exist on the API; SPA has **create/list only**. 3.7 adds Owner rename + soft-delete in the Group shell.

| ID | Ticket |
| -- | ------ |
| T-3.7.01 | Members Application + API (list / remove / role / leave) + ADR-0013 409s |
| T-3.7.02 | React People page + Group rename / soft-delete / Leave |
| T-3.7.03 | Sparse Playwright (Owner roster + Member leave or Owner remove; last-Owner blocked) |

**Non-scope for 3.7:** SMTP · invite list/revoke · Guest · roster-on-item · T-3.2.06 · Event location · merge `main`.

### Phase 3.8 — Thin invite hygiene (COMPLETED)

Owner can list outstanding invites and revoke an unused token. Spec: [`PHASE-3.8-INVITE-HYGIENE-SPEC.md`](../03-architecture/PHASE-3.8-INVITE-HYGIENE-SPEC.md).

Owner can list outstanding invites and revoke a unused token. 3.4 froze create+accept only.

| ID | Ticket |
| -- | ------ |
| T-3.8.01 | List + revoke Application + API |
| T-3.8.02 | React on People/Invite surface |
| T-3.8.03 | Sparse Playwright |

### Phase 3.9 — SMTP (optional for Gate A; COMPLETED)

Link invites already work. Email is “tell the team” from the origin job. Spec: [`PHASE-3.9-SMTP-SPEC.md`](../03-architecture/PHASE-3.9-SMTP-SPEC.md). T-3.9.01–04 shipped (optional `email` on create; Gmail API HTTPS best-effort via `Gmail:ClientId` / `ClientSecret` / `RefreshToken` / `From` + `PublicOrigin`; UI warning when `emailed` is false). Event/RSVP mail remains out. Generic SMTP is out (Render Free blocks 25/465/587).

### Ops (Gate A, does not wait on People)

Live is usable but two issues bite real users. Ticket when authorized; not a product feature.

| ID | Work |
| -- | ---- |
| T-OPS-01 | Persist ASP.NET DataProtection keys in Postgres (`DataProtectionKeys`) so cookies survive Render deploys — **COMPLETED** |
| T-OPS-02 | Grant Render GitHub app access to `kevin-esq/sonivo` (clone warning; auto-deploy) |

Free-instance spin-down (~50s cold start) is **accepted** until a paid instance. Not a Gate A blocker.

---

## Explicitly out of Gate A and Gate B (until a later plan)

- T-3.2.06 file Resource / blob / `content`
- Event location / notes / `includeCancelled` / un-cancel / hand-built plans
- Roster-on-item (“who sings this song”)
- Invite-as-Owner · Guest
- Q8 chart format · Q9 realtime · Q10 billing · Q11 mobile/PWA
- Account deletion product · WhatsApp · practice player

---

## Gate B (after Gate A — do not start now)

1. **Frontend redesign** of the shipped surfaces (Groups, Library, Setlist, Event, People, Invite, RSVP). Behavior stays; chrome changes.
2. Merge `develop` → `main` only after that cut.
3. Treat https://sonivo.onrender.com (or a custom domain) as the public product.

Until Gate B: `main` stays the pre-product workflow commit (revert PR [#14](https://github.com/kevin-esq/sonivo/pull/14) restored that). Integration is `develop`.

---

## How to start

Phase 3.7, 3.8, 3.9, and T-OPS-01 are **done**. Remaining Gate A ops: **T-OPS-02** (Kevin grants Render GitHub app access). Do not start Gate B.
