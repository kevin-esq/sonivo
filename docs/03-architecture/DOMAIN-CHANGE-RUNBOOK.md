# Runbook — changing the Sonivo host

**Status:** reference document (D6). Apply it when a custom domain is bought or the current host changes.
**Context (HECHO):** today the only host is `sonivo.onrender.com`, the brand name may change, and no code
depends on the host ([`PHASE-WHITELABEL-SPEC.md`](PHASE-WHITELABEL-SPEC.md) D2/D3).

> Do this **before** the cut-over date in a staging copy, never against production data.

## 0. Principle (D3)

All absolute URLs come from **`PublicOrigin`**; the product name comes from **`Brand:ProductName`**. No host
may be written in code, copy, or static assets. The checks below are *configuration + data*, not code edits —
if a code edit is needed, that is a bug in the host-agnosticism and must be fixed first.

## 1. Checklist

| # | Item | Where | Action |
| --- | --- | --- | --- |
| 1 | **`PublicOrigin`** | app configuration | point to the new origin (no trailing slash) |
| 2 | **`Passkeys:RelyingPartyId`** | app configuration | **keep empty** ⇒ rpId = current host (D4). Do **not** set a parent domain unless subdomains exist |
| 3 | **`Passkeys:AllowedOrigins`** | app configuration | list the new origin(s); remove the old one after cut-over |
| 4 | **Google OAuth redirect URI** | Google Cloud console | add the new `…/api/auth/google/response`; keep the old one until cut-over, then remove |
| 5 | **Gmail sender + links** | app configuration (`Gmail:*`) | confirm the sender; invitation emails build links from `PublicOrigin` at send time (D5) |
| 6 | **Allowed origins / CORS** | app configuration | same-site topology only (ADR-0020); no credentialed cross-origin |
| 7 | **Outstanding invitations** | data | already-sent links point to the old host. If the old host stays reachable, they keep working; otherwise **re-invite** |
| 8 | **Cookies** | browser/session | host-only ⇒ **everyone signs in again** on the new host. `sonivo.auth`/`sonivo.csrf` names do **not** change (D3) |
| 9 | **Passkeys migration** | data/users | credentials are bound to the old rpId ⇒ users **re-register** on the new host. Plan a Security-screen notice |
| 10 | **Permanent redirect** | hosting | serve a 301 from the old host to the new one while it is still active |
| 11 | **DNS / TLS** | hosting | issue the certificate for the new domain; keep the old one until redirects end |
| 12 | **`Brand:ProductName`** | app configuration | optional rename; independent from the host |

## 2. Unverifiable here — PREGUNTA

- **PREGUNTA:** does the current hosting (Render, HECHO the app runs at `sonivo.onrender.com`) keep the old
  host reachable **alongside** a new custom domain, so the 301 redirect in item 10 is possible? Not
  verifiable from this machine.
- **PREGUNTA:** does the hosting support **wildcard** TLS/DNS, needed only if subdomains (4.6) are ever
  unblocked? Not verifiable here.
- **PREGUNTA:** can the hosting issue a certificate for an apex domain and a `www` alias? Not verifiable here.

## 3. Order of operations (safe sequence)

1. Verify host-agnosticism: grep the codebase for the old host and for any hard-coded absolute URL.
2. Add the new origin to Google (§1.4) and to `Passkeys:AllowedOrigins` (§1.3) **before** switching.
3. Deploy with `PublicOrigin` still pointing at the **old** host (no user impact).
4. Flip `PublicOrigin` to the new host; verify emails, invitation links and the Security notice.
5. Serve a 301 from the old host; announce that passkeys must be re-registered.
6. After the redirect window, remove the old redirect URI and old allowed origins.

## 4. Rollback

Revert `PublicOrigin` to the previous host (one setting). Sessions created on the new host are host-only and
simply require signing in again on the old one. No schema change is involved, so rollback is safe and instant.
