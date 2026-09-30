# NOW — agent focus

**Updated:** 2026-09-30

## Checkpoint state

```text
Implementation: COMPLETE — wave 1 (baseline) MERGED; wave 2 (auth hardening C1+M1+M3) implemented + locally verified; wave 3 hardening pending
Human approval: APPROVED (explicit full-flow order 2026-09-30: delegate, review, audit, merge when green, delete branches, continue to completion)
Git checkpoint: wave 1 COMMITTED + MERGED (develop, PR #124 / a8b2684); wave 2 PENDING
Remote: wave 1 PUSHED + MERGED; wave 2 NOT PUSHED
CI: wave 1 PASSING (all checks incl. new CodeQL + SCA gates); wave 2 NOT RUN on GH
```

## Current state

- **DevSecOps engagement (user-authorized 2026-09-30; ADR-0044 ACCEPTED):** full backend security audit + tooling + CI automation delivered as [`SECURITY-AUDIT-2026-09.md`](../docs/03-architecture/SECURITY-AUDIT-2026-09.md).
  - **Findings:** 1 Critical (C1: passkey login-finish verifies nothing — signature/challenge/origin/rpIdHash/counter all unverified; credentialId = bearer string), 5 Medium (M1 login rate-limit gap, M2 XFF-spoofable rate limits, M3 single-gated Google test hook, M4 vulnerable transitive crypto chain, M5 §8 security logging not implemented), 4 Low.
  - **Applied (P0):** servicing bump 9.0.9→9.0.18 (M4, 8 High GHSAs cleared), `Directory.Build.props` NuGetAudit-all + NU1902/1903-as-errors (gate proven: 32 errors pre-fix), surgical security `.editorconfig` (CA5350 HMAC-SHA1 TOTP triaged with documented suppression), `codeql.yml`, `security.yml`, `dependabot.yml`, ADR-0044, TOOLING-AUDIT update.
  - **PLAN ONLY (pending approval + tickets):** C1 full server-side WebAuthn verifier (complete drop-in code in audit §6.1; needs `System.Formats.Cbor` approval), M3 (1 line), M1 (2 lines), M2/M5/L1–L4. Required-checks branch-protection commands documented (audit §7) to run AFTER workflows land on default branch.
- **UI/UX redesign (ADR-0043): CLOSED 2026-09-30** (PRs #115–#120 + release #121; main == develop). W5 limitation (Estudiar tab keeps conductor+tuner per TC-Q9-01/TC-PITCH-01 contract) stands.
- Passkeys E2E CI note: `.github/workflows/ci.yml` browses via `http://localhost:5173` (WebAuthn trustworthy-origin fix) — keep when changing E2E.

## Next authorized work

1. Owner reviews the audit report + P0 batch; approve P1 remediation (recommend starting with C1 — ticketed T-SEC-01..03, TDD per audit §6.1.4; requires approving `System.Formats.Cbor`).
2. After P0 lands on the default branch: run the §7 branch-protection commands to make all five checks required.

