# TOOLING-AUDIT.md — Sonivo

**Phase 0 status:** **CLOSED** (Phase 0.9 documentation reconciliation, 2026-09-15)  
**Tooling policy:** **AUTHORIZED** (ADR-0002 **ACCEPTED**, extended by ADR-0039/0041, ADR-0063–0066, and ADR-0099)
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

### GIT GOVERNANCE — PROJECT-LOCAL — AUTHORIZED (ADR-0065, user-authorized 2026-10-05)

`git-governance` (authored for Sonivo) — Conventional Commits, commitlint gate, branch naming, `gh` and `github` MCP usage; human authorization for Git actions preserved

### VALIDATION — PROJECT-LOCAL — AUTHORIZED (ADR-0066, user-authorized 2026-10-05)

`validation-symmetry` (authored for Sonivo) — server-authoritative validation; client mirrors the contract; FluentValidation/Zod not adopted

### TENANCY — PROJECT-LOCAL — AUTHORIZED (user-authorized 2026-10-14)

`group-tenancy-isolation` (authored for Sonivo) — Group is the only tenant; server-side membership check per request; `(GroupId, EntityId)` lookups; no ambient tenant filter. Rules recorded in **ADR-0079 (ACCEPTED)**; enforced by `tests/Sonivo.Integration.Tests/GroupIsolationArchitectureTests.cs`.

### DEVICE / GIT WORKFLOWS — PROJECT-LOCAL — AUTHORIZED (ADR-0099, user-authorized 2026-10-20)

- `android` — community `@us-all/android-mcp@1.14.4`; app/UI/emulator writes enabled for testing; arbitrary ADB shell disabled; categories limited to `device,apps,ui,logcat,emulator`. Package source and execution boundary reviewed; requires ADB on `PATH` and Node.js 22+.
- `GitKraken` — official GitKraken MCP via the GitKraken CLI; configured with `--readonly`. CLI 3.1.77 installed on this development host. GitKraken account authentication is still required for account-backed integrations.

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

## Project-local verified state (36 skill directories)

**13 Matt Pocock + 1 Impeccable + 8 knowledge workflows + 9 ADR-0063 additions + 2 ADR-0064 security skills + 1 ADR-0065 git governance + 1 ADR-0066 validation + 1 tenancy** under `.agents/skills/`:

`codebase-design` · `code-review` · `diagnosing-bugs` · `domain-modeling` · `grilling` · `grill-with-docs` · `impeccable` · `implement` · `prototype` · `research` · `resolving-merge-conflicts` · `tdd` · `to-spec` · `to-tickets`

`context-optimization` · `decision-record` · `knowledge-architecture` · `knowledge-maintenance` · `knowledge-retrieval` · `memory-writeback` · `project-documentation` · `session-handoff`

`creative-frameworks` · `dotnet-webapi` · `optimizing-ef-core-queries` · `create-datadriven-aspnetcore` · `csharp-refactoring` · `skill-creator` · `writing-for-agents` · `pr` · `differential-review`

`dotnet-secure-architecture` · `react-frontend-security` (ADR-0064, authored for Sonivo)

`git-governance` (ADR-0065, authored for Sonivo)

`validation-symmetry` (ADR-0066, authored for Sonivo)

`group-tenancy-isolation` (ADR-0079 ACCEPTED, authored for Sonivo; user-accepted 2026-10-14)

`skills-lock.json` has **13** Matt core entries only; the eight knowledge workflows and the ADR-0063 additions are not all external packages, and the ADR-0063 Matt additions (`pr`, `writing-for-agents`) are not yet in the lock. Update the lock only via the official `skills` CLI (its hash algorithm is not plain sha256). Root `.obsidian/` vault configuration remains local and was not changed.

**ADR-0063 (user-authorized 2026-10-04):** nine project-local skills from first-party sources (Microsoft .NET, Anthropic, Matt Pocock, Trail of Bits) plus the user-authored `creative-frameworks`, and the root `opencode.json` MCP servers (`drawio`, `excalidraw`, `sequential-thinking`, `fetch`). Sources were audited (frontmatter + bundled scripts/references). All four MCP servers verified connected via `opencode mcp list`; the earlier `@cmd8/excalidraw-mcp` candidate was dropped because it ships broken (`ERR_MODULE_NOT_FOUND`). See [`SKILLS-ECOSYSTEM-RESEARCH-2026-10.md`](SKILLS-ECOSYSTEM-RESEARCH-2026-10.md).

**ADR-0064 (user-authorized 2026-10-05):** migrated `opencode.json` to V2-native `mcp.servers`; added MCP `semgrep` and `snyk` (both enabled; `snyk` authenticates via `snyk_auth`); added project-local skills `dotnet-secure-architecture` and `react-frontend-security` (31 → 33). See [`OPENCODE-V2-MCP-SKILLS-2026-10.md`](OPENCODE-V2-MCP-SKILLS-2026-10.md).

**ADR-0099 (user-authorized 2026-10-20):** added the pinned community Android MCP with shell execution disabled and the official GitKraken MCP in read-only mode. See [`OPENCODE-V2-MCP-SKILLS-2026-10.md`](OPENCODE-V2-MCP-SKILLS-2026-10.md). Both are project-local in root `opencode.json`; the GitKraken CLI is installed on this development host.

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
| `playwright` MCP                          | Ambient user-global (`~/.config/opencode/opencode.json`) | Connected in this environment; **not** declared in repo `opencode.json` and not a reproducibility dependency. First-party `@playwright/mcp`; consider promoting project-local if the team relies on it |
| `infisical-local` MCP                     | Ambient user-global                | Connected; secretless duplicate is declared `disabled` in repo `opencode.json` (ADR-0066). The global entry embeds a universal-auth client secret in **plaintext** — move it to `{env:...}` (script `scripts/harden-global-opencode-config.ps1`) |

---

## Global-config audit (2026-10-14)

`~/.config/opencode/opencode.json` (user-global) declares `playwright` and
`infisical-local`. Neither is in the repo config, so neither is reproducible for
other contributors. Two findings:

1. **SECURITY (FIX APPLIED 2026-10-14):** the global `infisical-local` embedded
   `INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET` as a plaintext literal. It was moved to
   `{env:INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET}` (matching the repo entry) via
   `scripts/harden-global-opencode-config.ps1`, which backed up to
   `opencode.json.bak-20261014-183030` before rewriting only that value. **Still
   required:** set the environment variable and **rotate the previously-exposed
   secret** in Infisical, then `opencode service restart`.
2. **Reproducibility:** `playwright` resolves a profile under
   `P:\repos\sonivo\.playwright-mcp\profile`; it is useful for the `e2e/`
   Playwright suite but is a user-global dependency today.

---

## ADR-0002

**ACCEPTED** — original tooling policy and allowlist. ADR-0039 adds eight local knowledge workflows; ADR-0041 keeps all project skills in `.agents/skills/` only; ADR-0063–0066 add the previously recorded project-local MCP servers and skills; **ADR-0099** adds the Android and GitKraken MCP servers (user-authorized 2026-10-20).

---

## Confirmation

| Phase    | Actions                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0.8      | Project-local prune + lock prune + ADR-0002 ACCEPT                                                                      |
| 0.9      | Docs + `AGENTS.md` + obsolete `.gitignore` `graphify-out/` entry only                                                   |
| ADR-0039 | User-authorized addition of eight adapted, project-local knowledge workflows; no dependency or user-global tool changes |
| ADR-0063 | User-authorized addition of nine first-party project-local skills (.NET/Anthropic/Matt/Trail of Bits) + `creative-frameworks` + root `opencode.json` MCP servers |
| ADR-0064 | User-authorized OpenCode V2-native MCP config + `semgrep`/`snyk` MCP servers + two project-local security skills |
| ADR-0065 | User-authorized official `github` MCP server (local Docker) + `git-governance` skill and Conventional Commits `commit-msg` hook |
| ADR-0066 | User-authorized `docker-sandbox` MCP (enabled) + `infisical` secrets MCP (disabled) + `validation-symmetry` skill |
| ADR-0099 | User-authorized Android MCP (ADB shell disabled) + official GitKraken MCP (read-only) |

ADR-0040 is **SUPERSEDED** by ADR-0041; the user authorized one project-local customization tree under `.agents/`, with vendor hooks and agents removed.

**Did not (0.9):** change skills, MCP, CLIs, packages, lock skill hashes, globals, credentials, Git init, app code, or schema.
