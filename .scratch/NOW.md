# NOW — agent focus

**Updated:** 2026-09-30

## Checkpoint state

```text
Implementation: COMPLETE (DevSecOps audit P0 batch: gates + CI security + M4 fix; P1/P2 remediation PLAN ONLY — no auth code changes applied)
Human approval: PENDING (P0 batch + P1 plan review)
Git checkpoint: PENDING (uncommitted on fix/ui-polish-w7-hierarchy, alongside pre-existing user UI-polish changes — untouched)
Remote: NOT PUSHED
CI: NOT RUN locally on GH (local: build green 0/0, 444/444 backend tests vs live PG 5433, SCA clean)
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

