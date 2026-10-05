# TOOLING-AUDIT.md — Sonivo

**Phase 0 status:** **CLOSED** (Phase 0.9 documentation reconciliation, 2026-09-15)  
**Tooling policy:** **AUTHORIZED** (ADR-0002 **ACCEPTED**, extended by ADR-0039/0041)  
**Phase 0.9:** Documentation reconciliation only — **no** installs, uninstalls, or tooling changes.  
**Rule:** `DOCUMENTED ≠ VERIFIED PRESENT ≠ APPROVED/AUTHORIZED` · Sonivo allowlist is binding.

---

## Authorized policy (binding)

### CORE — PROJECT-LOCAL — AUTHORIZED

`grill-with-docs` · `domain-modeling` · `to-spec` · `to-tickets` · `tdd` · `implement` · `code-review` · `diagnosing-bugs` · `codebase-design`

### SPECIALIZED — PROJECT-LOCAL — AUTHORIZED (invoke only when required)

`impeccable` · `grilling` · `prototype` · `research` · `resolving-merge-conflicts`

### KNOWLEDGE WORKFLOWS — PROJECT-LOCAL — AUTHORIZED (ADR-0039)

`knowledge-architecture` · `knowledge-retrieval` · `memory-writeback` · `knowledge-maintenance` · `context-optimization` · `project-documentation` · `decision-record` · `session-handoff`

### DEFERRED — do not install, configure, invoke, or depend

`setup-matt-pocock-skills` · `handoff` · `product-marketing` · Context7 · all surplus Matt Pocock skills

### REJECTED — do not install or configure

`wayfinder` · `git-guardrails-claude-code` · `migrate-to-shoehorn` · `scaffold-exercises`

### Scope

All CORE, SPECIALIZED, and ADR-0039 knowledge workflow skills are **PROJECT-LOCAL** under `.agents/skills/`; ADR-0041 rejects parallel vendor-specific customization trees.  
Future tooling installations still require explicit human authorization.

---

## SECURITY TOOLING — AUTHORIZED (ADR-0044, user-authorized 2026-09-30 DevSecOps engagement)

Zero-install gates (SDK built-ins, project-local config): **NuGetAudit** (`all` mode, NU1902/NU1903 as build errors — `Directory.Build.props`) · **Roslyn security analyzers** (surgical curated ruleset — root `.editorconfig`).
CI workflows: **CodeQL C#** (`.github/workflows/codeql.yml`) · **SCA gate** (`.github/workflows/security.yml`) · **Dependabot** (`.github/dependabot.yml`: nuget ×8 dirs, npm ×2, github-actions).
Audit method: existing project-local `webappsec-review` skill (two-pass) — no new skills installed.
Rejected as redundant (see [`../03-architecture/SECURITY-AUDIT-2026-09.md`](../03-architecture/SECURITY-AUDIT-2026-09.md) §8): Security Code Scan, OWASP Dependency-Check. `System.Formats.Cbor` for the Critical C1 passkey fix: **PENDING explicit approval**.
Findings/plan of record: [`../03-architecture/SECURITY-AUDIT-2026-09.md`](../03-architecture/SECURITY-AUDIT-2026-09.md).

## Project-local verified state (23 skill directories)

**13 Matt Pocock + 1 Impeccable + 8 knowledge workflows + 1 user-authorized exception** under `.agents/skills/`:

`codebase-design` · `code-review` · `diagnosing-bugs` · `domain-modeling` · `grilling` · `grill-with-docs` · `impeccable` · `implement` · `prototype` · `research` · `resolving-merge-conflicts` · `tdd` · `to-spec` · `to-tickets`

`context-optimization` · `decision-record` · `knowledge-architecture` · `knowledge-maintenance` · `knowledge-retrieval` · `memory-writeback` · `project-documentation` · `session-handoff`

`skills-lock.json` has **13** Matt entries only; the eight local workflows are not external packages. Root `.obsidian/` vault configuration remains local and was not changed.

**User-authorized exception (2026-10-04):** `creative-frameworks` (`SKILL.md` added under `.agents/skills/`) **and** root `opencode.json` MCP servers (`drawio`, `excalidraw`, `sequential-thinking`, `fetch`) were installed under **explicit user authorization that overrode the documented prohibition** in `AGENTS.md`. These are **NOT** part of the ADR-0002/0039/0041 allowlist and are **not ratified** — present and user-directed, pending a ratifying ADR or removal. All four MCP servers were verified connected via `opencode mcp list`; the earlier `@cmd8/excalidraw-mcp` candidate was dropped because it ships broken (`ERR_MODULE_NOT_FOUND`).

| Artifact                                | State                                    |
| --------------------------------------- | ---------------------------------------- |
| Graphify project rule / `graphify-out/` | **ABSENT** (removed Phase 0.8)           |
| Watermarks project rule                 | **ABSENT** (removed Phase 0.8)           |
| `product-marketing`                     | **ABSENT** (deferred; removed Phase 0.8) |

Vendor customization folders `.cursor/`, `.codex/`, and `.claude/` are **ABSENT**; they were removed under ADR-0041 on 2026-09-28.

---

## Phase 0.8 prune (completed)

Removed surplus/deferred/rejected Matt dirs + `product-marketing`; removed `.cursor/rules/graphify.mdc`, `graphify-out/`, `.cursor/rules/clean-user-facing-text.mdc`.  
See Phase 0.8 history in repo conversation / prior audit versions if needed. Full removal name list was recorded at prune time.

---

## Unauthorized / ambient USER-GLOBAL tooling (documented, not touched)

| Item                                      | Classification                      | Sonivo policy                                       |
| ----------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| Graphify CLI                              | UNAUTHORIZED user-global            | Do not depend; not project-local                    |
| Context7                                  | UNAUTHORIZED / DEFERRED user-global | Do not configure or depend                          |
| watermarks-remover                        | UNAUTHORIZED user-global            | Do not depend; project-local artifacts removed      |
| Taste / Emil (and related design cluster) | Ambient user-global                 | Must not become a Sonivo reproducibility dependency |

---

## ADR-0002

**ACCEPTED** — original tooling policy and allowlist. ADR-0039 adds eight local knowledge workflows; ADR-0041 keeps all project skills in `.agents/skills/` only.

---

## Confirmation

| Phase    | Actions                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0.8      | Project-local prune + lock prune + ADR-0002 ACCEPT                                                                      |
| 0.9      | Docs + `AGENTS.md` + obsolete `.gitignore` `graphify-out/` entry only                                                   |
| ADR-0039 | User-authorized addition of eight adapted, project-local knowledge workflows; no dependency or user-global tool changes |

ADR-0040 is **SUPERSEDED** by ADR-0041; the user authorized one project-local customization tree under `.agents/`, with vendor hooks and agents removed.

**Did not (0.9):** change skills, MCP, CLIs, packages, lock skill hashes, globals, credentials, Git init, app code, or schema.
