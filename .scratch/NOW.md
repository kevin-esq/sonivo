# NOW — agent focus

**Updated:** 2026-09-30

## Checkpoint state

```text
Implementation: IN PROGRESS — UI/UX audit remediation Steps 1–8 (Fase 0 baseline GREEN; starting Fase A)
Human approval: APPROVED (explicit build-mode authorization 2026-09-30: execute Fases A–D + full local Playwright; commit/PR authorized for this program)
Git checkpoint: PENDING — security waves 1-2 MERGED (#124/#125), wave 3 COMMITTED; the UI/UX groups-redesign WIP is UNCOMMITTED on `develop`
Remote: security waves 1-2 PUSHED + MERGED, wave 3 PUSHED (branch); UI/UX WIP not pushed
CI: local only — baseline **57/57 passing (4.3m)** on 2026-09-30; remote CI not run

### Fase 0 operational notes (local E2E runner)

- **Vite must be launched in the SAME shell command as `npm test`.** A separately-detached `vite dev` is silently terminated mid-run (observed twice: 11 then 3 tests passed before `ERR_CONNECTION_REFUSED`). Working pattern: `Start-Process npm run dev` → wait for :5173 → `npm test` → `taskkill /T` — all in one command. API runs fine as a normal background shell with `Auth__EnableTestHook=true` on :5171; Postgres on :5433.
- Baseline console error captured: `GroupHomePage` nests `<Skeleton>` (`<div>`) inside a `<p>` → invalid HTML / hydration error (ticket A3).
```

## Current state

- **DevSecOps engagement (user-authorized 2026-09-30; ADR-0044 ACCEPTED):** full backend security audit + tooling + CI automation delivered as [`SECURITY-AUDIT-2026-09.md`](../docs/03-architecture/SECURITY-AUDIT-2026-09.md).
  - **Findings:** 1 Critical (C1: passkey login-finish verifies nothing — signature/challenge/origin/rpIdHash/counter all unverified; credentialId = bearer string), 5 Medium (M1 login rate-limit gap, M2 XFF-spoofable rate limits, M3 single-gated Google test hook, M4 vulnerable transitive crypto chain, M5 §8 security logging not implemented), 4 Low.
  - **Applied (P0):** servicing bump 9.0.9→9.0.18 (M4, 8 High GHSAs cleared), `Directory.Build.props` NuGetAudit-all + NU1902/1903-as-errors (gate proven: 32 errors pre-fix), surgical security `.editorconfig` (CA5350 HMAC-SHA1 TOTP triaged with documented suppression), `codeql.yml`, `security.yml`, `dependabot.yml`, ADR-0044, TOOLING-AUDIT update.
  - **Implemented across waves:** wave 2 = C1 (server-side WebAuthn verifier), M3 (double-gated Google test hook), M1 (`auth-login` per-IP policy); wave 3 = M2 (IPv6 /64 partition truncation, FIXED-in-part), M5 (security event logging), L1 (30-day absolute session cap), L2 (defense-in-depth CSP), L3 (`USER app`), L4 (`forgot-password` per-email cooldown). Residuals: M2 trusted-proxy pinning + absolute per-account budgets remain follow-ups. Required-checks branch-protection commands documented (audit §7) to run AFTER workflows land on default branch.
- **UI/UX redesign (ADR-0043): CLOSED 2026-09-30** (PRs #115–#120 + release #121; main == develop). W5 limitation (Estudiar tab keeps conductor+tuner per TC-Q9-01/TC-PITCH-01 contract) stands.
- **UI/UX polish program (defect remediation inside ADR-0043): CLOSED 2026-09-30** — manual MCP browser audit (36 screenshots) produced findings P0–P3, fixed as waves W6–W9: PR #122 (real light theme + WCAG contrast E2E), #123 (single header per screen, deduped facts, plurals, Ajustes as the real admin page), #126 (ChordPro directives no longer leak into lyrics, honest Avanzado tab, separated danger zones), #154 (My groups/auth/404 in the system, labelled appearance controls, "Sin portada"). Local E2E grew 46 → **53/53**. Details: [`PHASE-UI-UX-POLISH-SPEC.md`](../docs/03-architecture/PHASE-UI-UX-POLISH-SPEC.md) §Waves.
- **UI/UX audit remediation program (Steps 1–8): APPROVED + IN PROGRESS (user authorization 2026-09-30, build mode).** Executing the full refactor plan in [`UI-UX-AUDIT-2026-09.md`](../docs/03-architecture/UI-UX-AUDIT-2026-09.md): **A** consolidate the uncommitted groups redesign (wire toast/persisted/copy hooks, decompose `GroupsPage`), **B** token-layer WCAG fix (`primary-ink`/`primary-strong`/`error-ink`/`error-strong`) + ≥44px touch targets, **C** mobile "Más" entry for Miembros + async feedback + copy pass + account tab strip + density, **D** full local Playwright validation. Per-wave gates: `npm run build`, `oxlint`, targeted E2E, then commit + PR (authorized for this program).
- Passkeys E2E CI note: `.github/workflows/ci.yml` browses via `http://localhost:5173` (WebAuthn trustworthy-origin fix) — keep when changing E2E.

## Next authorized work

1. Owner reviews the audit report + P0 batch; approve P1 remediation (recommend starting with C1 — ticketed T-SEC-01..03, TDD per audit §6.1.4; requires approving `System.Formats.Cbor`).
2. After P0 lands on the default branch: run the §7 branch-protection commands to make all five checks required.

- **UI/UX audit (2026-09) COMPLETE:** harness \2e/visual-audit\ (axe-core + 3 viewports, 102 screens) and the prioritised report with a step-by-step refactor plan: [\UI-UX-AUDIT-2026-09.md\](../docs/03-architecture/UI-UX-AUDIT-2026-09.md). Headline finding: the brand palette fails AA (primary 4.09:1, primary button 3.91:1, error 3.76:1) — ~128 contrast nodes, fixable in the token layer. Also: sub-44px targets, Miembros unreachable on mobile, thin async feedback.

