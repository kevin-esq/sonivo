# Phase 6 — Web surfaces

**Status:** PROPOSED. **Goal:** finish web route migration and host tenancy gradually without weakening session boundaries.

**Scope:** map Next and legacy route ownership; migrate route groups one feature slice at a time; verify host routing, reserved slug parity, host-only cookies, SessionHandoff, CSRF, OAuth, passkeys, and SEO before DNS cutover.

**Out of scope:** creating another Next project by default; broad route rename; parent-domain session cookies; changing `/app` canonical route namespace; changing slug rules without approval.

**Exit criteria:** all in-scope product routes have one owner; legacy bridge has no active caller before deletion; cross-host auth and security checks pass; wildcard DNS and certificates are proven on a test domain before production.

**Tickets:** T-601 to T-603. T-601 host decision blocks domain migration; route inventory can start after T-101.
