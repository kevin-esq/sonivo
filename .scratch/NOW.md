# NOW — current work and Git checkpoint

## Local release batch

**Updated:** 2026-10-26
**Scope:** Complete the user-authorized local batch on `feature/local-release-completion`, based on `develop` at `b8246af`: rich lyric interoperability (ADR-0100/0101), searchable/favoritable Song library, media streaming improvements, native-client completion, and fixes to previously failing Playwright journeys. Next.js App Router/auth/routing changes from merged `develop` are preserved; no route catalog or security boundary was replaced.
- **Implementation:** COMPLETE locally. Four previously failing Playwright journeys were fixed and pass. No schema migration was applied to a database.
- **Human approval:** APPROVED for this batch and explicit authorization to commit, push, and open a PR after validation.
- **Git checkpoint:** COMMITTED (`feat(repertoire): complete rich lyrics and library workflows`).
- **Remote:** PUSHED to `origin/feature/local-release-completion`; PR #302 is open against `develop`.
- **CI:** RUNNING on PR #302; latest observed checks are pending.
- **Validation:** `.NET Release`: 858 passed, 0 failed; Next.js production build and app TypeScript check passed; Playwright: 112 passed, 2 feature-flag skips, 0 failed; Android `assembleDebug` passed with JDK 21; `git diff --check` passed. iOS build/device QA was unavailable on this Windows host.
- **Open gates:** Review PR CI; do not apply the included migration to staging/production from this checkpoint. Existing production, mobile provisioning/device QA and web host cutover gates remain governed by their phase specs.
- **Git policy:** no files under `.codex-remote-attachments/` or scratch research/review notes are included.

## Previous checkpoint

PR #300 merged the public/product route foundation and PR #301 merged the static-export E2E isolation fix. `develop` was at `b8246af` when this batch branched. Preserve WBR deployment, staging, OAuth, production database/RLS and native mobile release gates documented below.
