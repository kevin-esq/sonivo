---
name: session-handoff
description: Leave a compact, accurate continuation point for interrupted Sonivo work. Use when an active task cannot be completed in the current session or another developer must resume it.
---

# Session Handoff

Use `.scratch/NOW.md` as the single tracked current-state note. Update it in place; do not create `knowledge/09-work/active/` or append a chat transcript.

## Include

- Current ticket or task and its authorized scope.
- Implementation and human-approval status.
- Git checkpoint, remote, and CI status using the repository's required fields.
- Current branch/worktree when it affects resumption.
- Relevant spec/ADR links, blockers, and one exact next action.
- Verification actually performed and its result.

## Rules

- Record facts only; distinguish current checkout from other branches.
- Keep completed history in ADRs, specs, commits, or PRs; summarize it with links.
- Preserve unrelated user changes and mention them only when they affect resumption.
- Keep secrets and credentials out of the note.
- When work is complete, update the checkpoint and next focus instead of leaving stale active status.
