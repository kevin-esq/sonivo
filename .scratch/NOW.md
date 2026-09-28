# NOW — agent focus

**Updated:** 2026-09-28

## Checkpoint state

```text
Implementation: COMPLETE (ADR-0041 single `.agents/` project customization tree)
Human approval: PENDING
Git checkpoint: PENDING
Remote: NOT PUSHED
CI: NOT RUN (documentation and skill files only)
```

## Current state

- This work is on the current `develop` checkout. `.cursor/`, `.codex/`, and `.claude/` customizations were removed by explicit user authorization; no commit, push, or PR was performed.
- The worktree already had changes in `docs/00-context/GLOSSARY.md`, API/spec docs, local vault files, and the original ZIP; preserve them.
- Root `.obsidian/` is local configuration and was not modified.

## Next authorized work

T-R2-04 remains active on the existing `feature/t-r2-drop-postgres` branch. The current checkout is `develop`; do not switch branches implicitly. The merge gate is verification that R2 object count matches the Postgres rows before dropping `ResourceBlobs`. See [`PHASE-R2-SPEC.md`](../docs/03-architecture/PHASE-R2-SPEC.md).

Completed wave history belongs in ADRs, phase specs, commits, and PRs rather than this current-state note.
