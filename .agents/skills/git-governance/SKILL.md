---
name: git-governance
description: >
  Enforces Sonivo's Git and GitHub conventions: Conventional Commits,
  commitlint-style validation, branch naming, and correct use of the GitHub CLI
  (gh) and the GitHub MCP server. USE FOR: writing commit messages, preparing or
  validating a commit, opening/updating PRs, checking CI, or reasoning about
  branches and GitHub. DO NOT USE FOR: deciding product scope, code review
  content (use code-review/differential-review), or anything that authorizes a
  Git action on its own.
---

# Git & GitHub Governance (Sonivo)

Rules for producing a clean history and using GitHub correctly. This skill
**prepares and validates** Git work; it never grants authority to perform Git
actions — that comes only from explicit user authorization (see `AGENTS.md`).

## When to Use

- Drafting a commit message for a staged change.
- Preparing a PR title/body or checking CI/PR status.
- Choosing a branch name or reasoning about branches.
- Sanity-checking a diff before hand-off.

## Non-Negotiable Invariants

1. **Authorization gate (highest priority).** Agents must **not** commit, push,
   create/merge PRs, or change GitHub settings unless the current task
   explicitly authorizes that action. "Ticket complete" or "approved" is **not**
   authorization for Git. When in doubt, prepare the exact command and stop.
2. **Conventional Commits is mandatory.** Every commit subject must match:
   `<type>(<scope>): <short description>` (lowercase, imperative).
3. **No AI credit trailers.** Never add `Co-authored-by` or any AI/tool credit.
   Commits are authored as the human developer only.
4. **No secrets.** Never stage `.env`, tokens, credentials, or generated junk.
5. **Approved scope only.** Do not sweep unrelated or pre-existing changes into a
   commit.

## 1. Commit messages (commitlint / Conventional Commits)

Format: `<type>(<scope>): <description>`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

- `feat(auth): add middleware token validation`
- `fix(branding): single save control via the floating bar`
- `docs(plans): define entitlements and personalization levels`
- `chore(tooling): adopt OpenCode V2 MCP config`

A `!` after the type/scope marks a breaking change (`feat(api)!: ...`).

**Validate before committing** (do it yourself; do not delegate to the human):

```sh
npx --no-install commitlint --from HEAD~1 --to HEAD
# or, for the message you are about to write:
npx --no-install commitlint --edit .git/COMMIT_EDITMSG
```

If commitlint is not installed, the repository's own `commit-msg` hook in
`.githooks/` applies the same rule with a plain POSIX validator (see
[`.githooks/commit-msg`](../../../.githooks/commit-msg)). Enable it once with:

```sh
git config core.hooksPath .githooks
```

## 2. Staging and pre-commit hygiene

- Stage **intentionally**: `git add <paths>` for approved scope only.
- Inspect the staged diff: `git diff --staged` — confirm no debug code, no
  secrets in plain text, no unrelated files.
- Never use `git add -A` / `git add .` in a tree that may contain other work.

## 3. Branches

- Branch from `develop` (feature work) or the agreed base.
- Names: `feature/*`, `fix/*`, `chore/*`, `docs/*`.
- One coherent slice per branch; do not stack unrelated work on a branch that
  belongs to another task. If a commit landed on the wrong branch, move it with
  `git switch -c <new-branch>` + `git branch -f <old-branch> HEAD~1` instead of
  leaving unrelated history behind.

## 4. Using `gh` and the GitHub MCP server

Prefer the official tools over custom scripts.

- **PRs:** `gh pr create --base develop --title "<type>(<scope>): <desc>" --body "<...>"`.
  Use the repository PR template ([`.github/pull_request_template.md`](../../../.github/pull_request_template.md)).
- **Status:** `gh pr status`, `gh pr view --json ...`, `gh run list`, `gh run watch`.
- **MCP server:** the `github` MCP server (toolsets: context, repos, pull_requests,
  actions, git) is available for reading repositories, PRs, issues, runs, and
  tags. Use it for context; still respect the authorization gate for writes.
- **Merge is never implied** by opening a PR; CI must be green before merge.

## Checklist

- [ ] Subject follows `<type>(<scope>): <description>` and passes the hook
- [ ] Only approved-scope files staged; `git diff --staged` reviewed
- [ ] No secrets, `.env`, or unrelated files
- [ ] No AI/tool co-author trailer
- [ ] Correct branch; no unrelated history
- [ ] Git action (commit/push/PR) is explicitly authorized by the current task

## More Info

- [Conventional Commits](https://www.conventionalcommits.org/)
- [commitlint](https://commitlint.js.org/)
- `.github/pull_request_template.md`, `AGENTS.md` (Git authority).
- Related skills: `pr`, `code-review`, `differential-review`.
