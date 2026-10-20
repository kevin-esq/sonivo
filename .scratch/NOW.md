# NOW — current work and Git checkpoint

**Updated:** 2026-10-20
**Active work:** resolve and rerun the Playwright failures from the Phase 4 release in one follow-up PR.
**Source worktree:** `fix/e2e-phase4-followup`, based on `origin/develop` (`9c9eed8`). PR #282 is squash-merged to `develop`; this branch contains the authorized E2E follow-up.

## Checkpoint

- **Implementation:** IN PROGRESS
- **Human approval:** APPROVED for the user's explicit request to ship this batch to `develop`
- **Git checkpoint:** COMMITTED (`ded76d5`)
- **Remote:** PUSHED (`ded76d5` is on the PR #283 branch)
- **CI:** PENDING for `ded76d5`; the previous full E2E run had 8 failures and 97 passes.

## Release organization

- PR #281 (`chore/repo-hygiene`) was squash-merged into `develop` as `9680543` on 2026-10-20. Frontend, backend, CodeQL, SCA, and Playwright E2E passed.
- PR #282 (`feat/platform`) was squash-merged into `develop` as `9c9eed8` on 2026-10-20. Backend build/tests, Analyze, frontend, CodeQL, and SCA passed; E2E failed and was skipped only under the user's one-time authorization. PR #283's first Playwright run reported 20 failures; the next reported 8 failures and 97 passes while its other five CI checks passed. This correction pass updates stale UI expectations, fixes current-time entry in the Practice journey, corrects the mobile banner landmark, and uses the current branding save bar. Do not merge until the full rerun is green.
- The route commit was rebased onto current `develop`; route catalog, host boundaries, redirects, and canonical specs are included together.
- Keep generated local state and the user-provided Xcode archive out of Git. The source `.gitignore` now excludes the Playwright profile, nested visual-audit output, and Xcode archive; tracked Turbo cache removal was merged by PR #281.
- Update the README only alongside the security/runtime changes it documents. Keep this file as a concise operational checkpoint; durable behavior and decisions belong in `docs/`.
- `origin/develop` is at `9c9eed8`. PRs #281 and #282 target `develop`; neither is a production release. No deployment workflow is present under `.github/workflows/`; no release promotion was performed.

## Workstream status

| Workstream | State | Gate / canonical record |
| --- | --- | --- |
| Phase 4.0 reports, audit, onboarding, Help | Merged into `develop` in PR #282; product journey is in the E2E follow-up | [`PHASE-4.0-INSIGHTS-HELP-SPEC.md`](../docs/03-architecture/PHASE-4.0-INSIGHTS-HELP-SPEC.md) |
| Phase 4.1 resource-level access | Merged into `develop` in PR #282; row-level UI journey is in the E2E follow-up | [`PHASE-4.1-RESOURCE-ACCESS-SPEC.md`](../docs/03-architecture/PHASE-4.1-RESOURCE-ACCESS-SPEC.md) |
| Phase 4.2 database principal separation | Merged into `develop`; production identity and RLS enforcement remain unverified | [`PHASE-4.2-POSTGRESQL-RLS-SPEC.md`](../docs/03-architecture/PHASE-4.2-POSTGRESQL-RLS-SPEC.md) |
| Web route catalog and surface boundaries | Merged into `develop` in PR #282; Next build and standalone TypeScript check passed | [`PHASE-WEB-BOUNDARIES-SPEC.md`](../docs/03-architecture/PHASE-WEB-BOUNDARIES-SPEC.md) |
| Repertoire, Practice, Stage, timing, warm-up | In `develop`; conductor E2E follow-up is in progress | [`PHASE-PLAY-SYNC-SPEC.md`](../docs/03-architecture/PHASE-PLAY-SYNC-SPEC.md), [`PHASE-PRACTICE-ROUTINES-SPEC.md`](../docs/03-architecture/PHASE-PRACTICE-ROUTINES-SPEC.md) |
| User-visible surface completion | In release batch; full .NET Release suite passed 835/835 | [`PHASE-USER-SURFACE-COMPLETION-SPEC.md`](../docs/03-architecture/PHASE-USER-SURFACE-COMPLETION-SPEC.md) |
| Media upload limits and streaming | In release batch; aggregate storage quota remains deferred | [`PHASE-MEDIA-UPLOADS-SPEC.md`](../docs/03-architecture/PHASE-MEDIA-UPLOADS-SPEC.md) |
| Native Android/iOS | Included locally; device QA, session audit/revocation verification, and production provisioning remain open | [`PHASE-MOBILE-NATIVE-SPEC.md`](../docs/03-architecture/PHASE-MOBILE-NATIVE-SPEC.md) |
| Group settings refresh | In release batch | [`PHASE-GROUP-SETTINGS-REFRESH-SPEC.md`](../docs/03-architecture/PHASE-GROUP-SETTINGS-REFRESH-SPEC.md) |

## Production gates

- The production database preflight did not prove the deployed API identity. The connected role has `BYPASSRLS` and `CREATEROLE`, `sonivo_app` is absent, and required tables are missing. Do not apply migrations, grants, or role changes from this checkpoint.
- The repository has no production migration workflow; use the operator-controlled procedure documented in [`DEPLOYMENT.md`](../docs/03-architecture/DEPLOYMENT.md) after the required role and schema gates pass.
- Production mobile token issuance remains blocked pending the ADR-0094 signing/encryption keys, issuer/audience, exact redirect registrations, migration, rate limits, revocation/audit verification, minimum versions, store URLs, and deployment ownership.
- Web host cutover remains blocked until WBR-02–06 staging, OAuth, host-only cookie, CSRF/CORS/CSP, noindex, and host-matrix checks pass.

## Validation evidence

Validation for PR #282: .NET Release suite passed 835/835; web production build and standalone TypeScript check passed; Android `assembleDebug` passed with JDK 21 and the installed Android SDK; local runtime principal verification passed. Its CI backend, Analyze, frontend, CodeQL, and SCA jobs passed. E2E failed; the user authorized skipping it for the core merge and requested one follow-up PR. PR #283 has two full E2E runs so far, with 20 then 8 failures; its other five CI checks passed on the latest run. Commit `ded76d5` corrects those failures and is awaiting its full CI run. Mobile device QA and production checks remain open.
