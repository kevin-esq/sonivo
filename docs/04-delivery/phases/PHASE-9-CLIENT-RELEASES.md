# Phase 9 — Mobile and desktop readiness

**Status:** PROPOSED / FUTURE. **Goal:** verify native client release boundaries and choose desktop technology only from measurable needs.

**Scope:** audit OIDC PKCE, Keychain/Keystore use, API version headers, and release parity; run a no-code PWA/Tauri/Electron discovery spike against Stage mode; design separate platform CI/releases only after signing and ownership decisions.

**Out of scope:** desktop implementation, new authentication scheme, storing tokens in browser cookies for native clients, app-store release, signing secret changes, or paid tooling adoption.

**Exit criteria:** native auth/storage claims have source and platform test evidence; desktop decision records measurable criteria and is approved; iOS runs on macOS CI with secrets protected; release tags and changelogs have one owner and rollback path.

**Tickets:** T-901 to T-903. T-902 depends on T-701; release automation waits on owner approval.
