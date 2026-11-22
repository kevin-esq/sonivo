# T-108 — Ignore and untrack versioned scratch screenshots

**Metadata:** phase 1; status **Backlog**; priority P2; size S; risk medium; depends on T-101; blocks none; suggested owner Kevin.

## Context and why

**FACT:** `git ls-files .scratch/shots` reports 102 tracked PNG files in the current base. These local screenshots are temporary review artifacts and add binary churn. Recommendation R7 estimated about 110.

## Exact scope

Add a precise ignore rule for `.scratch/shots/` and remove those paths from the Git index while preserving local files. Do not rewrite history or delete screenshots from the developer’s working copy. Confirm whether any image has durable evidence value before untracking.

## Out of scope

No screenshot deletion, history rewrite, broad `.scratch/` ignore rule, or changes to other scratch files.

## Files/paths likely touched

`.gitignore`; index entries under `.scratch/shots/`; documentation only if existing guidance needs clarification.

## Implementation plan

1. Confirm current count and inspect whether any screenshots are referenced by active docs or tests.
2. Add the narrow ignore rule.
3. Untrack only the verified screenshot paths while keeping local copies.
4. Verify tracked status and ignore behavior.

## Acceptance criteria

- [ ] No screenshot under `.scratch/shots/` remains tracked after the change.
- [ ] Existing local screenshots remain on disk and are ignored.
- [ ] No other `.scratch/` files are ignored or removed.
- [ ] One small PR using the repository PR template.

## Tests to add or update
**Commands and expected results:** use the relevant commands in [README.md](../README.md#validation-command-reference). Commands exit 0, focused regression tests pass, and required external infrastructure is available. Report unmet prerequisites; never claim an unrun check.


Run `git ls-files .scratch/shots` and expect no output. Check a retained screenshot with `git check-ignore`. Run `git diff --check`.

## Rollback plan

Revert the ignore/index commit to restore tracked screenshot paths. Local screenshot files remain available.

## Risks and warning signs

Some images may be linked from historical review notes. Search links before untracking. Stop if a screenshot is required evidence for an active security or product decision.

## Suggested branch and commits

- Branch: `chore/ignore-scratch-shots`
- Commit: `chore(docs): untrack temporary scratch screenshots`

## Definition of Done

Acceptance passes; no local screenshot is deleted; docs and Board match actual status; PR follows the repository template; human review and Git authorization are explicit.

## Execution prompt

> Work only on T-108 in Sonivo. Read AGENTS.md, current context and applicable decisions. Verify all screenshot paths and their references before editing. Preserve local files and history. Add only the narrow ignore rule and index removals for verified screenshots. Keep all engineering docs and commit text in English. Do not remove other scratch artifacts. Verify with git ls-files, git check-ignore, and git diff --check. Update BOARD.md and .scratch/NOW.md when status changes. Do not commit, push, or open a PR unless current authorization explicitly permits it.

