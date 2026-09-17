# Phase 3.9 Thin invite email (Resend) specification

**Status:** **COMPLETED** (T-3.9.01–03 on `feature/phase-3.9-smtp`). Authorized 2026-09-17 (Kevin Esquivel) — optional Gate A slice of [`SYSTEM-CLOSE-PLAN.md`](../01-product/SYSTEM-CLOSE-PLAN.md).  
**Product bet:** The shareable link still does the join. Email is how the Owner **tells** a person about that link.  
**Date:** 2026-09-17  
**Depends on:** Phase 3.4 (Q-I1–I8), Phase 3.8; ADR-0012, 0019–0020.

Accepted ADRs remain authoritative. This spec **does not reopen** Q-I1: the join mechanic stays the unguessable link. Email is optional outbound of the same URL.

---

## Product Goal

An Owner can optionally type an email when creating an invite. If Resend is configured, Sonivo sends the join URL. If it is not configured, or send fails, the invite still exists and the Owner still gets the copyable link.

---

## Frozen mechanics (thin defaults)

| ID | Decision for thin 3.9 |
| -- | --------------------- |
| Q-M1 | Link + accept contract **unchanged** (3.4/3.8). Token still shown once. |
| Q-M2 | Provider: **Resend HTTP API**. Not a generic SMTP server. Not WhatsApp. |
| Q-M3 | Config: `Resend:ApiKey`, `Resend:From`, `PublicOrigin`. All three required to send. Missing any → treat as not configured. |
| Q-M4 | `POST .../invitations` body `{ email?: string }`. Omit/blank → no send (today’s e2e). |
| Q-M5 | Invalid email format → **400** (invite **not** created). |
| Q-M6 | Invite row is always created when AuthZ/email-format pass. Send is **best-effort**. Success body adds `emailed: boolean`. Send failure or not configured → **201** `emailed: false`. |
| Q-M7 | Do not persist the invitee email. Do not add RSVP/Event notification mail. |
| Q-M8 | UI: optional email on Invite member; always show the link after create. If they typed email and `emailed` is false, show a non-blocking warning. |
| Q-M9 | CI/local: no real Resend. Tests use a fake sender. Existing Playwright stays green without an API key. |

This freeze is a **thin product default**, not a new ADR.

---

## Scope

| Area | In |
| ---- | -- |
| API | Optional `email` on create; `emailed` on 201 |
| Infra | Resend HTTP sender behind `IEmailSender` |
| UI | Optional email field on Group shell invite |
| Tests | Application + API with fake sender |

---

## Explicit Non-Scope

WhatsApp · digest · Event/RSVP mail · invite-as-Owner · Guest · T-3.2.06 · merge `main` · UI redesign · real Resend in CI

---

## Tickets

| ID | Work |
| -- | ---- |
| T-3.9.01 | `IEmailSender` + Resend + create-invite `email`/`emailed` + tests — **DONE** |
| T-3.9.02 | React optional invite email + warning — **DONE** |
| T-3.9.03 | Playwright without Resend (existing journeys + **TC-INV-03**) — **DONE** |

---

## API

`POST /api/groups/{groupId}/invitations` Owner, CSRF.

Body: `{ email?: string }`  
Success **201:** `{ id, token, expiresAt, emailed }`
