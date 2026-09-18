# Phase Thin Google OAuth — Identity external login

**Status:** AUTHORIZED 2026-09-17 (Kevin Esquivel — “Acepto todo”). ADR-0026 **ACCEPTED**.  
**Product bet:** Lower signup friction without changing the cookie session model.  
**Date:** 2026-09-17  
**Depends on:** ADR-0009, 0011, 0020, **0026**; existing `AuthScreen` + Identity cookie stack.

---

## Product Goal

User can **Continuar con Google** on login/register and land in the same authenticated SPA session (`sonivo.auth`) as password login — including return to join `?next=`.

---

## Frozen mechanics

| ID | Decision |
| -- | -------- |
| Q-G1 | Identity `AddGoogle` + challenge/callback; then `SignInAsync` → `sonivo.auth` |
| Q-G2 | Config `Authentication:Google:ClientId` / `ClientSecret` — **not** `Gmail:*` |
| Q-G3 | Scopes: `openid email profile` |
| Q-G4 | Link existing user by email only if Google `email_verified`; set `EmailConfirmed` |
| Q-G5 | `state` carries safe relative `next` path (join); reject absolute/external URLs |
| Q-G6 | UI Spanish: “Continuar con Google” |
| Q-G7 | CI without live Google: mock/skip E2E for real Google; keep password E2E green |
| Q-G8 | When Google keys missing: hide button or disable with no 500 on AuthScreen |

---

## Scope

| Area | In |
| ---- | -- |
| API | Challenge start + Google callback → cookie session |
| Identity | External login map/create user + AspNetUserLogins |
| UI | AuthScreen Google button (login + register routes) |
| Tests | Unit/integration for link/create + next allowlist; Playwright password paths unchanged |

---

## Explicit Non-Scope

Account linking settings UI · unlink · Apple/Microsoft · JWT · BFF · mobile bearer · Gmail/Drive scopes · Event/RSVP mail · karaoke · password set for Google-only users

---

## Ops — Render / env vars

Provision a **separate** Google Cloud OAuth client (Web application) for user sign-in. Do **not** reuse Phase 3.9 Gmail send credentials.

| Config key | Render env var | Notes |
| ---------- | -------------- | ----- |
| `Authentication:Google:ClientId` | `Authentication__Google__ClientId` | OAuth client ID |
| `Authentication:Google:ClientSecret` | `Authentication__Google__ClientSecret` | OAuth client secret |

Authorized redirect URI (Google Cloud Console):

- Production: `https://<your-host>/api/auth/google/response`
- Local (Vite proxy): `http://localhost:5173/api/auth/google/response`

When either var is missing, `/api/auth/providers` returns `{ "google": false }` and AuthScreen hides **Continuar con Google** (no 500).

---

## Tickets

| ID | Work |
| -- | ---- |
| T-OAUTH-01 | ADR-0026 already in DECISIONS — wire Google external auth + callback + user create/link |
| T-OAUTH-02 | AuthScreen button + `next` state round-trip |
| T-OAUTH-03 | Tests (mocked); document Render env vars |

Ship one PR: `feature/t-oauth-google` → `develop`.

---

## Audit checklist

- [x] No JWT / BFF  
- [x] No reuse of `Gmail:*`  
- [x] Cookie session after callback  
- [x] Email verified gate for link  
- [x] No open redirect via `next`  
- [x] Password journeys still 16+ Playwright green  
- [x] No Cursor trailers  
