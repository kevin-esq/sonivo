# NOW — current work and Git checkpoint

## Frontend architecture foundation (WBR-03)

**Updated:** 2026-10-26
**Scope:** User-authorized frontend architecture cleanup aligned with accepted ADR-0089/0092 and WBR-03. No accepted ADR was changed or superseded.
- **Implementation:** WBR-03 implementation COMPLETE; WBR-05/06 deployment integration remains IN PROGRESS. The root App Router layout owns cookie-backed session, theme, language, audio, rail-presence, and toast providers. Identity routes use `/auth/*`; product routes and Group sections use `/app/*`. The React Router bridge remains for `NEXT_EXPORT=1` static-host parity. PR #300 passes the static-export flag from the server page so .NET fallback deep links render the app instead of marketing. Existing staging host/auth and WBR-04–06 integration gates remain open; no DNS, hosting, or OAuth configuration changed.
- **Human approval:** APPROVED for the frontend fixes and explicit request to commit, push, open a PR, and merge after validation.
- **Git checkpoint:** PR #300 merged into `develop` as `050ff38`. Follow-up `fix/static-export-smoke-isolation` branch contains an E2E config correction; commit/PR pending.
- **Remote:** `origin/develop` is at `050ff38`; follow-up fix not pushed.
- **CI:** Post-merge run `40382761890` failed because the static-host-only Playwright smoke was included in the normal full-stack suite. Its intended standalone static-host CI step passed. Follow-up will exclude that spec only when `SONIVO_E2E_STATIC_EXPORT` is not enabled.
- **Validation:** The merged static-export smoke passed locally for `/app/home` and `/app/groups/11111111-1111-1111-1111-111111111111`; the live staging browser showed the private Group app content. The follow-up spec-discovery check lists 107 tests in normal mode and 108 in static-export mode; the static smoke passed locally (1/1). Next.js static export, request-aware build, and TypeScript checks passed for PR #300. No dependency or tooling was added.
**Updated:** 2026-10-20
**Active work:** close the authorized release batch. PRs #281–#283 are squash-merged to `develop`; production promotion remains gated by the checks below.
**Source worktree:** `docs/release-batch-checkpoint`, based on `develop` (`5e6eaf1`).

## Checkpoint

- **Implementation:** COMPLETE
- **Human approval:** APPROVED for the user's explicit request to ship this batch to `develop`
- **Git checkpoint:** COMMITTED through PRs #281, #282, and #283
- **Remote:** PUSHED (`origin/develop` is at `5e6eaf1`)
- **CI:** PASSING on the merged E2E follow-up: Backend, Frontend, Analyze, CodeQL, and SCA passed; Playwright passed 105 tests with 2 feature-gated skips and no flaky retries.

## Release organization

- PR #281 (`chore/repo-hygiene`) was squash-merged into `develop` as `9680543` on 2026-10-20. Frontend, backend, CodeQL, SCA, and Playwright E2E passed.
- PR #282 (`feat/platform`) was squash-merged into `develop` as `9c9eed8` on 2026-10-20. Backend build/tests, Analyze, frontend, CodeQL, and SCA passed; E2E was skipped only under the user's one-time authorization.
- PR #283 (`fix(e2e): restore phase 4 critical journeys`) was squash-merged into `develop` as `5e6eaf1` on 2026-10-20 after all six required checks passed. Its final Playwright run reported 105 passed, 2 feature-gated skips, and no flaky retries. It updated the Phase 4 journeys for current UI flows, corrected current-time entry in Practice, fixed the mobile banner landmark, and used the group branding save bar.
- The route commit was rebased onto current `develop`; route catalog, host boundaries, redirects, and canonical specs are included together.
- Keep generated local state and the user-provided Xcode archive out of Git. The source `.gitignore` now excludes the Playwright profile, nested visual-audit output, and Xcode archive; tracked Turbo cache removal was merged by PR #281.
- Update the README only alongside the security/runtime changes it documents. Keep this file as a concise operational checkpoint; durable behavior and decisions belong in `docs/`.
- `origin/develop` is at `5e6eaf1`. PRs #281–#283 are merged to `develop`; none is a production release. No deployment workflow is present under `.github/workflows/`; no release promotion was performed.

## Workstream status

| Workstream | State | Gate / canonical record |
| --- | --- | --- |
| Phase 4.0 reports, audit, onboarding, Help | Implementation and critical journeys merged in PRs #282 and #283 | [`PHASE-4.0-INSIGHTS-HELP-SPEC.md`](../docs/03-architecture/PHASE-4.0-INSIGHTS-HELP-SPEC.md) |
| Phase 4.1 resource-level access | Implementation and row-level UI journey merged in PRs #282 and #283 | [`PHASE-4.1-RESOURCE-ACCESS-SPEC.md`](../docs/03-architecture/PHASE-4.1-RESOURCE-ACCESS-SPEC.md) |
| Phase 4.2 database principal separation | Merged into `develop`; production identity and RLS enforcement remain unverified | [`PHASE-4.2-POSTGRESQL-RLS-SPEC.md`](../docs/03-architecture/PHASE-4.2-POSTGRESQL-RLS-SPEC.md) |
| Web route catalog and surface boundaries | Merged into `develop` in PR #282; Next build and standalone TypeScript check passed | [`PHASE-WEB-BOUNDARIES-SPEC.md`](../docs/03-architecture/PHASE-WEB-BOUNDARIES-SPEC.md) |
| Repertoire, Practice, Stage, timing, warm-up | In `develop`; conductor journey and playhead-rounding assertion passed in PR #283 | [`PHASE-PLAY-SYNC-SPEC.md`](../docs/03-architecture/PHASE-PLAY-SYNC-SPEC.md), [`PHASE-PRACTICE-ROUTINES-SPEC.md`](../docs/03-architecture/PHASE-PRACTICE-ROUTINES-SPEC.md) |
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

Validation for the release batch: .NET Release tests passed 835/835; web production build and standalone TypeScript check passed; Android `assembleDebug` passed with JDK 21 and the installed Android SDK; local runtime-principal verification passed. PR #281 passed Backend, Frontend, CodeQL, SCA, and Playwright. PR #282 passed Backend, Frontend, Analyze, CodeQL, and SCA; its E2E was skipped under the user's one-time authorization. PR #283 passed all six required checks; Playwright run `39475512027` completed with 105 passed, 2 feature-gated skips, and no flakes. The production gates above, mobile device QA, and web host cutover remain open.
