# NOW — agent focus

**Updated:** 2026-09-28

## Checkpoint state

```text
Implementation: IN PROGRESS (UI/UX redesign authorized: W0 MERGED PR #115; W1 MERGED PR #116; W2 Listas active)
Human approval: APPROVED (explicit full-flow order: delegate to agents, audit per wave, push + merge when green, delete branches, continue to completion)
Git checkpoint: COMMITTED + MERGED to develop (PR #115 ecb0cdb; branch deleted)
Remote: PUSHED + MERGED
CI: PASSING (PR #115: Backend + Frontend + Playwright E2E green; local E2E 35/35 + 1 auditor fix es-default)
```

## Current state

- **Passkeys E2E CI fix (current focus):** `e2e/tests/passkeys.spec.ts` now attaches a CDP virtual authenticator, and `.github/workflows/ci.yml` browses via `http://localhost:5173` instead of `127.0.0.1`. Root cause: commit `51bcb9e` wired real `navigator.credentials.create()` into the Security page; headless Chromium throws `SecurityError` on IP-literal origins, so CI's `127.0.0.1` baseURL made TC-PK-01 fail deterministically (previously the UI faked the credential). Verified locally against the real stack: TC-PK-01 passes on `localhost`; it still fails on `127.0.0.1` (reproduction pinned). oxlint clean. No commit/push performed.
- Prior ADR-0041 work: `.cursor/`, `.codex/`, and `.claude/` customizations were removed by explicit user authorization; no commit, push, or PR was performed.
- The worktree already had changes in `docs/00-context/GLOSSARY.md`, API/spec docs, local vault files, and the original ZIP; preserve them.
- Root `.obsidian/` is local configuration and was not modified.

## Next authorized work

T-R2-04 PR #95 is MERGED (d7e3340, 2026-09-27) and post-hoc subset verification is COMPLETE 2026-09-29: 4 live keys, 2/2 present in R2, 2/2 missing bytes explained (never backfilled; parents soft-deleted by Owner 2026-09-21; remedy DECLINED by Owner 2026-09-29 (test files only, dead rows stay as orphans). UI shell slice (R1–R4) MERGED (PR #109). See [`PHASE-R2-SPEC.md`](../docs/03-architecture/PHASE-R2-SPEC.md).

Completed wave history belongs in ADRs, phase specs, commits, and PRs rather than this current-state note.
