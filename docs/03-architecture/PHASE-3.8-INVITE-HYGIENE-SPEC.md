# Phase 3.8 Thin invite hygiene specification

**Status:** **COMPLETED** (T-3.8.01–03 on `feature/phase-3.8-invite-hygiene`). Authorized 2026-09-17 (Kevin Esquivel) — Gate A of [`SYSTEM-CLOSE-PLAN.md`](../01-product/SYSTEM-CLOSE-PLAN.md).  
**Product bet:** A live unused invite link is a hole. The Owner can see outstanding invites and revoke one without SMTP.  
**Date:** 2026-09-17  
**Depends on:** ADR-0012, 0019–0020; Phase 3.4 invites; Phase 3.7 People.

Accepted ADRs remain authoritative. This spec **adds** list/revoke on the existing `Invitations` table. It does **not** reopen Q-I1 (link, not email). It does **not** return the plaintext token after create.

---

## Product Goal

After creating an invite, the Owner can open **People**, see outstanding (unused, unexpired) invites, and **Revoke** so the old `/join/{token}` link stops working.

---

## User Journey

```text
OWNER
  Invite member → copy link (token still once, 3.4)
  People → Outstanding invites
  → Revoke
  → old join URL is invalid
```

---

## Frozen mechanics (thin defaults)

| ID | Decision for thin 3.8 |
| -- | --------------------- |
| Q-H1 | List `GET .../invitations` Owner only → 200 `{ items: [{ id, createdAt, expiresAt }] }`. **Never** return `token` or `tokenHash`. Outstanding = not accepted and not expired. Newest first. |
| Q-H2 | Revoke `DELETE .../invitations/{invitationId}` Owner only → **204**. Hard-delete the unused row (no new column). Already accepted → **409**. Missing → **404**. Expired unused may still be deleted if listed? Listed only if unexpired; revoke of unknown/expired id → **404**. |
| Q-H3 | Member list/revoke → **403**. Non-member → **404**. Anon → **401**. |
| Q-H4 | CSRF on DELETE (ADR-0020). |
| Q-H5 | Accept of a revoked token → existing **400** invalid/expired (row gone). |
| Q-H6 | UI on People (Owner). Member does not see outstanding invites. |
| Q-H7 | No SMTP. Token still shown **once** at create on the Group shell. |

This freeze is a **thin product default**, not a new ADR.

---

## Scope

| Area | In |
| ---- | -- |
| API | GET invitations, DELETE invitation |
| Persistence | Reuse `Invitations`; hard-delete on revoke |
| UI | People: outstanding list + Revoke |
| E2E | TC-INV-02 create → revoke → join fails |

---

## Explicit Non-Scope

SMTP · resend email · invite-as-Owner · Guest · show token again · accepted-invite history · T-3.2.06 · merge `main` · UI redesign

---

## Tickets

| ID | Work |
| -- | ---- |
| T-3.8.01 | Application + API + tests |
| T-3.8.02 | React outstanding invites on People |
| T-3.8.03 | Sparse Playwright TC-INV-02 |

---

## API

Cookie + `X-CSRF-TOKEN` on DELETE. Problem Details.

| Method | Route | AuthZ | Success | Failures |
| ------ | ----- | ----- | ------- | -------- |
| GET | `/api/groups/{groupId}/invitations` | Owner | 200 `{ items }` | 401, 403, 404 |
| DELETE | `/api/groups/{groupId}/invitations/{invitationId}` | Owner | 204 | 401, 403, 404, 409 |

---

## E2E

**TC-INV-02:** Owner creates invite; People shows outstanding; Owner revokes; second user opening the old join URL sees invalid/expired.
