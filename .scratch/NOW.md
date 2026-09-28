# NOW — agent focus

**Updated:** 2026-09-28

## Checkpoint state

```text
Implementation: COMPLETE (T-CI-PK: fix passkeys E2E on CI — WebAuthn origin + virtual authenticator)
Human approval: PENDING
Git checkpoint: PENDING
Remote: NOT PUSHED
CI: NOT RUN (fix must be pushed to GitHub to validate the Playwright job)
```

## Current state

- **Passkeys E2E CI fix (current focus):** `e2e/tests/passkeys.spec.ts` now attaches a CDP virtual authenticator, and `.github/workflows/ci.yml` browses via `http://localhost:5173` instead of `127.0.0.1`. Root cause: commit `51bcb9e` wired real `navigator.credentials.create()` into the Security page; headless Chromium throws `SecurityError` on IP-literal origins, so CI's `127.0.0.1` baseURL made TC-PK-01 fail deterministically (previously the UI faked the credential). Verified locally against the real stack: TC-PK-01 passes on `localhost`; it still fails on `127.0.0.1` (reproduction pinned). oxlint clean. No commit/push performed.
- Prior ADR-0041 work: `.cursor/`, `.codex/`, and `.claude/` customizations were removed by explicit user authorization; no commit, push, or PR was performed.
- The worktree already had changes in `docs/00-context/GLOSSARY.md`, API/spec docs, local vault files, and the original ZIP; preserve them.
- Root `.obsidian/` is local configuration and was not modified.

## Next authorized work

T-R2-04 remains active on the existing `feature/t-r2-drop-postgres` branch. The current checkout is `develop`; do not switch branches implicitly. The merge gate is verification that R2 object count matches the Postgres rows before dropping `ResourceBlobs`. See [`PHASE-R2-SPEC.md`](../docs/03-architecture/PHASE-R2-SPEC.md).

Completed wave history belongs in ADRs, phase specs, commits, and PRs rather than this current-state note.
