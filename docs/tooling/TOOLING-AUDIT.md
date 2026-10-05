# TOOLING-AUDIT.md — Sonivo

**Phase 0 status:** **CLOSED** (Phase 0.9 documentation reconciliation, 2026-09-15)  
**Tooling policy:** **AUTHORIZED** (ADR-0002 **ACCEPTED**, extended by ADR-0039/0041, **ADR-0063**, and **ADR-0064**)  
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

### PLATFORM / OFFICIAL — PROJECT-LOCAL — AUTHORIZED (ADR-0063, user-authorized 2026-10-04)

`dotnet-webapi` · `optimizing-ef-core-queries` · `create-datadriven-aspnetcore` · `csharp-refactoring` (Microsoft .NET team) · `skill-creator` (Anthropic) · `writing-for-agents` · `pr` (Matt Pocock) · `differential-review` (Trail of Bits) · `creative-frameworks` (user-authored)

### SECURITY HARDENING — PROJECT-LOCAL — AUTHORIZED (ADR-0064, user-authorized 2026-10-05)

`dotnet-secure-architecture` · `react-frontend-security` (authored for Sonivo, adapted to its stack; not imported from third parties)

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
Audit method: existing `webappsec-review` skill (two-pass) — no new skills installed at that time.
**ADR-0064 (user-authorized 2026-10-05):** added security MCP servers `semgrep` and `snyk` (both local, enabled; `snyk` authenticates via `snyk_auth`), plus the project-local skills `dotnet-secure-architecture` and `react-frontend-security`. See [`OPENCODE-V2-MCP-SKILLS-2026-10.md`](OPENCODE-V2-MCP-SKILLS-2026-10.md).
Rejected as redundant (see [`../03-architecture/SECURITY-AUDIT-2026-09.md`](../03-architecture/SECURITY-AUDIT-2026-09.md) §8): Security Code Scan, OWASP Dependency-Check. `System.Formats.Cbor` for the Critical C1 passkey fix: **PENDING explicit approval**.
Findings/plan of record: [`../03-architecture/SECURITY-AUDIT-2026-09.md`](../03-architecture/SECURITY-AUDIT-2026-09.md).

## Project-local verified state (33 skill directories)

**13 Matt Pocock + 1 Impeccable + 8 knowledge workflows + 9 ADR-0063 additions + 2 ADR-0064 security skills** under `.agents/skills/`:

`codebase-design` · `code-review` · `diagnosing-bugs` · `domain-modeling` · `grilling` · `grill-with-docs` · `impeccable` · `implement` · `prototype` · `research` · `resolving-merge-conflicts` · `tdd` · `to-spec` · `to-tickets`

`context-optimization` · `decision-record` · `knowledge-architecture` · `knowledge-maintenance` · `knowledge-retrieval` · `memory-writeback` · `project-documentation` · `session-handoff`

`creative-frameworks` · `dotnet-webapi` · `optimizing-ef-core-queries` · `create-datadriven-aspnetcore` · `csharp-refactoring` · `skill-creator` · `writing-for-agents` · `pr` · `differential-review`

`dotnet-secure-architecture` · `react-frontend-security` (ADR-0064, authored for Sonivo)

`skills-lock.json` has **13** Matt core entries only; the eight knowledge workflows and the ADR-0063 additions are not all external packages, and the ADR-0063 Matt additions (`pr`, `writing-for-agents`) are not yet in the lock. Update the lock only via the official `skills` CLI (its hash algorithm is not plain sha256). Root `.obsidian/` vault configuration remains local and was not changed.

**ADR-0063 (user-authorized 2026-10-04):** nine project-local skills from first-party sources (Microsoft .NET, Anthropic, Matt Pocock, Trail of Bits) plus the user-authored `creative-frameworks`, and the root `opencode.json` MCP servers (`drawio`, `excalidraw`, `sequential-thinking`, `fetch`). Sources were audited (frontmatter + bundled scripts/references). All four MCP servers verified connected via `opencode mcp list`; the earlier `@cmd8/excalidraw-mcp` candidate was dropped because it ships broken (`ERR_MODULE_NOT_FOUND`). See [`SKILLS-ECOSYSTEM-RESEARCH-2026-10.md`](SKILLS-ECOSYSTEM-RESEARCH-2026-10.md).

**ADR-0064 (user-authorized 2026-10-05):** migrated `opencode.json` to V2-native `mcp.servers`; added MCP `semgrep` and `snyk` (both enabled; `snyk` authenticates via `snyk_auth`); added project-local skills `dotnet-secure-architecture` and `react-frontend-security` (31 → 33). See [`OPENCODE-V2-MCP-SKILLS-2026-10.md`](OPENCODE-V2-MCP-SKILLS-2026-10.md).

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

**ACCEPTED** — original tooling policy and allowlist. ADR-0039 adds eight local knowledge workflows; ADR-0041 keeps all project skills in `.agents/skills/` only; **ADR-0063** adds nine first-party platform/meta/security skills and the root `opencode.json` MCP servers (user-authorized 2026-10-04). **ADR-0064** migrates `opencode.json` to V2-native `mcp.servers` and adds the `semgrep`/`snyk` MCP servers plus two project-local security skills (user-authorized 2026-10-05).

---

## Confirmation

| Phase    | Actions                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0.8      | Project-local prune + lock prune + ADR-0002 ACCEPT                                                                      |
| 0.9      | Docs + `AGENTS.md` + obsolete `.gitignore` `graphify-out/` entry only                                                   |
| ADR-0039 | User-authorized addition of eight adapted, project-local knowledge workflows; no dependency or user-global tool changes |
| ADR-0063 | User-authorized addition of nine first-party project-local skills (.NET/Anthropic/Matt/Trail of Bits) + `creative-frameworks` + root `opencode.json` MCP servers |
| ADR-0064 | User-authorized OpenCode V2-native MCP config + `semgrep`/`snyk` MCP servers + two project-local security skills |

ADR-0040 is **SUPERSEDED** by ADR-0041; the user authorized one project-local customization tree under `.agents/`, with vendor hooks and agents removed.

**Did not (0.9):** change skills, MCP, CLIs, packages, lock skill hashes, globals, credentials, Git init, app code, or schema.
