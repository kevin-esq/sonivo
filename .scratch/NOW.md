# NOW — agent focus

**Updated:** 2026-09-30

## Checkpoint state

```text
Implementation: COMPLETE — waves 1-3 (baseline + auth C1/M1/M3 + hardening M2/M5/L1-L4); auditor fixes applied (legacy passkey rows -> 401; IPv4-mapped rate-limit partition)
Human approval: APPROVED (explicit full-flow order 2026-09-30: delegate, review, audit, merge when green, delete branches, continue to completion)
Git checkpoint: wave 1 MERGED (PR #124 / a8b2684); wave 2 MERGED (PR #125 / 9a05fa3); wave 3 COMMITTED (this branch)
Remote: waves 1-2 PUSHED + MERGED; wave 3 PUSHED (branch)
CI: waves 1-2 PASSING (all checks incl. CodeQL + SCA gates); wave 3 local validation — Release build 0w/0e, tests 460/460 (Domain 80, Application 176, Integration 57, API 147), frontend build green; full E2E runs in CI (local ports held by the owner's running app instance)
```

## Current state

- **DevSecOps engagement (user-authorized 2026-09-30; ADR-0044 ACCEPTED):** full backend security audit + tooling + CI automation delivered as [`SECURITY-AUDIT-2026-09.md`](../docs/03-architecture/SECURITY-AUDIT-2026-09.md).
  - **Findings:** 1 Critical (C1: passkey login-finish verifies nothing — signature/challenge/origin/rpIdHash/counter all unverified; credentialId = bearer string), 5 Medium (M1 login rate-limit gap, M2 XFF-spoofable rate limits, M3 single-gated Google test hook, M4 vulnerable transitive crypto chain, M5 §8 security logging not implemented), 4 Low.
  - **Applied (P0):** servicing bump 9.0.9→9.0.18 (M4, 8 High GHSAs cleared), `Directory.Build.props` NuGetAudit-all + NU1902/1903-as-errors (gate proven: 32 errors pre-fix), surgical security `.editorconfig` (CA5350 HMAC-SHA1 TOTP triaged with documented suppression), `codeql.yml`, `security.yml`, `dependabot.yml`, ADR-0044, TOOLING-AUDIT update.
  - **Implemented across waves:** wave 2 = C1 (server-side WebAuthn verifier), M3 (double-gated Google test hook), M1 (`auth-login` per-IP policy); wave 3 = M2 (IPv6 /64 partition truncation, FIXED-in-part), M5 (security event logging), L1 (30-day absolute session cap), L2 (defense-in-depth CSP), L3 (`USER app`), L4 (`forgot-password` per-email cooldown). Residuals: M2 trusted-proxy pinning + absolute per-account budgets remain follow-ups. Required-checks branch-protection commands documented (audit §7) to run AFTER workflows land on default branch.
- **UI/UX redesign (ADR-0043): CLOSED 2026-09-30** (PRs #115–#120 + release #121; main == develop). W5 limitation (Estudiar tab keeps conductor+tuner per TC-Q9-01/TC-PITCH-01 contract) stands.
- **UI/UX polish program (defect remediation inside ADR-0043): CLOSED 2026-09-30** — manual MCP browser audit (36 screenshots) produced findings P0–P3, fixed as waves W6–W9: PR #122 (real light theme + WCAG contrast E2E), #123 (single header per screen, deduped facts, plurals, Ajustes as the real admin page), #126 (ChordPro directives no longer leak into lyrics, honest Avanzado tab, separated danger zones), #154 (My groups/auth/404 in the system, labelled appearance controls, "Sin portada"). Local E2E grew 46 → **53/53**. Details: [`PHASE-UI-UX-POLISH-SPEC.md`](../docs/03-architecture/PHASE-UI-UX-POLISH-SPEC.md) §Waves.
- Passkeys E2E CI note: `.github/workflows/ci.yml` browses via `http://localhost:5173` (WebAuthn trustworthy-origin fix) — keep when changing E2E.

## Next authorized work

1. Owner reviews the audit report + P0 batch; approve P1 remediation (recommend starting with C1 — ticketed T-SEC-01..03, TDD per audit §6.1.4; requires approving `System.Formats.Cbor`).
2. After P0 lands on the default branch: run the §7 branch-protection commands to make all five checks required.

- **UI/UX audit (2026-09) COMPLETE:** harness \2e/visual-audit\ (axe-core + 3 viewports, 102 screens) and the prioritised report with a step-by-step refactor plan: [\UI-UX-AUDIT-2026-09.md\](../docs/03-architecture/UI-UX-AUDIT-2026-09.md). Headline finding: the brand palette fails AA (primary 4.09:1, primary button 3.91:1, error 3.76:1) — ~128 contrast nodes, fixable in the token layer. Also: sub-44px targets, Miembros unreachable on mobile, thin async feedback.

