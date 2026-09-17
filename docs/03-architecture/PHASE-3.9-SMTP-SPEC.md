# Phase 3.9 Thin invite email specification

**Status:** **COMPLETED** (T-3.9.01–04). T-3.9.04 Gmail HTTPS on `develop`/`main` (PR [#19](https://github.com/kevin-esq/sonivo/pull/19)). **Live probe 2026-09-17:** invite create returned `emailed=true` on https://sonivo.onrender.com (Gmail HTTPS env set on Render).  
**Product bet:** The shareable link still does the join. Email is how the Owner **tells** a person about that link.  
**Date:** 2026-09-17  
**Depends on:** Phase 3.4 (Q-I1–I8), Phase 3.8; ADR-0012, 0019–0020.

Accepted ADRs remain authoritative. This spec **does not reopen** Q-I1: the join mechanic stays the unguessable link. Email is optional outbound of the same URL.

---

## Product Goal

An Owner can optionally type an email when creating an invite. If Gmail is configured, Sonivo sends the join URL from that Gmail inbox over HTTPS. If it is not configured, or send fails, the invite still exists and the Owner still gets the copyable link.

---

## Frozen mechanics (thin defaults)

| ID | Decision for thin 3.9 |
| -- | --------------------- |
| Q-M1 | Link + accept contract **unchanged** (3.4/3.8). Token still shown once. |
| Q-M2 | Provider: **Gmail API HTTPS** (`users.messages.send`). Not Resend. Not a generic SMTP server (Render Free blocks 25/465/587). Not WhatsApp. From is the linked Gmail address. |
| Q-M3 | Config: `Gmail:ClientId`, `Gmail:ClientSecret`, `Gmail:RefreshToken`, `Gmail:From`, `PublicOrigin`. Missing any → treat as not configured. |
| Q-M4 | `POST .../invitations` body `{ email?: string }`. Omit/blank → no send (today’s e2e). |
| Q-M5 | Invalid email format → **400** (invite **not** created). |
| Q-M6 | Invite row is always created when AuthZ/email-format pass. Send is **best-effort**. Success body adds `emailed: boolean`. Send failure or not configured → **201** `emailed: false`. |
| Q-M7 | Do not persist the invitee email. Do not add RSVP/Event notification mail. |
| Q-M8 | UI: optional email on Invite member; always show the link after create. If they typed email and `emailed` is false, show a non-blocking warning. |
| Q-M9 | CI/local: no real Gmail. Tests use a fake sender. Playwright stays green without OAuth secrets. |

This freeze is a **thin product default**, not a new ADR.

---

## Scope

| Area | In |
| ---- | -- |
| API | Optional `email` on create; `emailed` on 201 |
| Infra | Gmail HTTPS sender behind `IEmailSender` |
| UI | Optional email field on Group shell invite |
| Tests | Application + API with fake sender |

---

## Explicit Non-Scope

WhatsApp · digest · Event/RSVP mail · invite-as-Owner · Guest · T-3.2.06 · merge `main` · UI redesign · real Gmail OAuth in CI · generic SMTP

---

## Tickets

| ID | Work |
| -- | ---- |
| T-3.9.01 | `IEmailSender` + create-invite `email`/`emailed` + tests — **DONE** |
| T-3.9.02 | React optional invite email + warning — **DONE** |
| T-3.9.03 | Playwright without a live mail key (existing journeys + **TC-INV-03**) — **DONE** |
| T-3.9.04 | Swap live provider to Gmail API HTTPS (no owned domain; Render Free cannot SMTP) — **DONE** on `develop` |

---

## API

`POST /api/groups/{groupId}/invitations` Owner, CSRF.

Body: `{ email?: string }`  
Success **201:** `{ id, token, expiresAt, emailed }`
