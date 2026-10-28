# SKILLS-INVENTORY.md — Sonivo

**Phase 0 status:** **CLOSED** (Phase 0.9, 2026-09-15)  
**Allowlist:** **AUTHORIZED** (ADR-0002 **ACCEPTED**, extended by ADR-0039/0041, ADR-0063–0066, ADR-0099, ADR-0102, and ADR-0103)

Distinguish: **PRESENT** (on disk) · **AUTHORIZED** (Sonivo allowlist) · **DEFERRED** · **REJECTED** · **USER-GLOBAL**

---

## AUTHORIZED allowlist (binding)

### CORE — PROJECT-LOCAL

`grill-with-docs` · `domain-modeling` · `to-spec` · `to-tickets` · `tdd` · `implement` · `code-review` · `diagnosing-bugs` · `codebase-design`

### SPECIALIZED — PROJECT-LOCAL

`impeccable` · `grilling` · `prototype` · `research` · `resolving-merge-conflicts`

### KNOWLEDGE WORKFLOWS — PROJECT-LOCAL (ADR-0039)

`knowledge-architecture` · `knowledge-retrieval` · `memory-writeback` · `knowledge-maintenance` · `context-optimization` · `project-documentation` · `decision-record` · `session-handoff`

### PLATFORM / OFFICIAL — PROJECT-LOCAL (ADR-0063, user-authorized 2026-10-04)

From first-party sources, audited before install:

- `dotnet-webapi` · `optimizing-ef-core-queries` · `create-datadriven-aspnetcore` · `csharp-refactoring` — `dotnet/skills` (Microsoft .NET team)
- `skill-creator` — `anthropics/skills` (Anthropic)
- `writing-for-agents` · `pr` — `mattpocock/skills`
- `differential-review` — `trailofbits/skills`
- `creative-frameworks` — user-authored

### SECURITY HARDENING - PROJECT-LOCAL (ADR-0064, user-authorized 2026-10-05)

Authored for Sonivo and adapted to its stack (not imported from third parties):

- `dotnet-secure-architecture` - ASP.NET Core / EF Core / Identity / tenancy hardening and review
- `react-frontend-security` - Next.js App Router / React 19 / Tailwind XSS, env-leak, token, and client-authz review

### FRONTEND STRUCTURE - PROJECT-LOCAL (user-authorized 2026-10-07)

Authored for Sonivo:

- `frontend-architecture` - feature-folder structure, page-orchestration rule,
  API/i18n layout, and the hard language rule (English code/back-end/routes; only
  UI copy localized via `t()`, es/en/pt).

### GIT GOVERNANCE — PROJECT-LOCAL (ADR-0065, user-authorized 2026-10-05)

Authored for Sonivo; documents Conventional Commits, commitlint, branch naming,
and `gh` / `github` MCP usage, with the human authorization gate preserved:

- `git-governance`

### VALIDATION — PROJECT-LOCAL (ADR-0066, user-authorized 2026-10-05)

Authored for Sonivo; server-authoritative validation with client symmetry:

- `validation-symmetry`

### TENANCY — PROJECT-LOCAL (user-authorized 2026-10-14)

Authored for Sonivo; records Group-as-tenant rules and forbids the ambient-tenant
model (ADR-0079 ACCEPTED):

- `group-tenancy-isolation` — Group is the only tenant; server-side membership
  check per request; `(GroupId, EntityId)` lookups; no ambient tenant filter.

### DATABASE PLATFORM — PROJECT-LOCAL (ADR-0102, user-authorized 2026-10-27)

Official Neon skills for platform and Postgres workflows:

- `neon` · `neon-postgres` — `neondatabase/agent-skills`

### RESPONSE / CONTEXT WORKFLOWS — PROJECT-LOCAL (ADR-0103, user-authorized 2026-10-28)

- `caveman` · `ponytail` — upstream skills, source commits and licenses pinned below.
- `ponytail-review` — Sonivo-authored, user-invoked review limited to over-engineering.
- `headroom-context` — Sonivo-authored; uses the optional Headroom MCP only for safe-to-send content and preserves the retrieval hash.

### DEFERRED (not installed project-local; do not invoke/depend)

`setup-matt-pocock-skills` · `handoff` · `product-marketing` · Context7 · surplus Matt skills

### EVALUATED, NOT INSTALLED (ADR-0063)

`obra/superpowers` (telemetry + subagent model) · `webapp-testing` (Python vs TS `e2e/`) · `frontend-design` (overlaps `impeccable`) · MSTest `dotnet-test` skills (Sonivo uses xUnit) · third-party `prompt-engineering`

### REJECTED (not installed; do not install)

`wayfinder` · `git-guardrails-claude-code` · `migrate-to-shoehorn` · `scaffold-exercises`

---

## PRESENT project-local skills (43 directories)

**43** directories under `.agents/skills/` — all **AUTHORIZED** (ADR-0002/0039/0041 + ADR-0063–0066 + ADR-0099 + ADR-0102/0103):

| Directory                       | Role                 |
| ------------------------------- | -------------------- |
| `codebase-design`               | CORE                 |
| `code-review`                   | CORE                 |
| `diagnosing-bugs`               | CORE                 |
| `domain-modeling`               | CORE                 |
| `grilling`                      | SPECIALIZED          |
| `grill-with-docs`               | CORE                 |
| `impeccable`                    | SPECIALIZED          |
| `implement`                     | CORE                 |
| `prototype`                     | SPECIALIZED          |
| `research`                      | SPECIALIZED          |
| `resolving-merge-conflicts`     | SPECIALIZED          |
| `tdd`                           | CORE                 |
| `to-spec`                       | CORE                 |
| `to-tickets`                    | CORE                 |
| `context-optimization`          | KNOWLEDGE            |
| `decision-record`               | KNOWLEDGE            |
| `knowledge-architecture`        | KNOWLEDGE            |
| `knowledge-maintenance`         | KNOWLEDGE            |
| `knowledge-retrieval`           | KNOWLEDGE            |
| `memory-writeback`              | KNOWLEDGE            |
| `project-documentation`         | KNOWLEDGE            |
| `session-handoff`               | KNOWLEDGE            |
| `creative-frameworks`           | CREATIVE (ADR-0063)  |
| `dotnet-webapi`                 | PLATFORM (ADR-0063)  |
| `optimizing-ef-core-queries`    | PLATFORM (ADR-0063)  |
| `create-datadriven-aspnetcore`  | PLATFORM (ADR-0063)  |
| `csharp-refactoring`            | PLATFORM (ADR-0063)  |
| `skill-creator`                 | META (ADR-0063)      |
| `writing-for-agents`            | META (ADR-0063)      |
| `pr`                            | PROCESS (ADR-0063)   |
| `differential-review`           | SECURITY (ADR-0063)  |
| `dotnet-secure-architecture`    | SECURITY (ADR-0064)  |
| `react-frontend-security`       | SECURITY (ADR-0064)  |
| `git-governance`                | GIT (ADR-0065)       |
| `validation-symmetry`           | VALIDATION (ADR-0066) |
| `group-tenancy-isolation`       | TENANCY (2026-10-14) |
| `frontend-architecture`         | FRONTEND (2026-10-07) |
| `neon`                          | DATABASE (ADR-0102)  |
| `neon-postgres`                 | DATABASE (ADR-0102)  |
| `caveman`                       | RESPONSE (ADR-0103)  |
| `ponytail`                      | ENGINEERING (ADR-0103) |
| `ponytail-review`               | REVIEW (ADR-0103)    |
| `headroom-context`              | CONTEXT (ADR-0103)   |

= **13** Matt Pocock (core) + **1** Impeccable + **8** ADR-0039 knowledge workflows + **9** ADR-0063 additions + **2** ADR-0064 security skills + **1** frontend structure + **1** ADR-0065 git governance + **1** ADR-0066 validation + **1** tenancy + **2** ADR-0102 Neon skills + **4** ADR-0103 response/context skills = **43 AUTHORIZED**.

Removed skills are **not** listed as installed.

### Related project-local config

| Path               | Notes                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| `.agents/skills/`  | Sole project-local skills directory; contains all 39 authorized procedures |
| `.obsidian/`       | Local vault configuration; intentionally not modified                                 |
| `opencode.json`    | Root MCP servers (`drawio`, `excalidraw`, `sequential-thinking`, `fetch`) — ADR-0063; `semgrep` + `snyk` — ADR-0064; `github` (local Docker) — ADR-0065; `docker-sandbox` + `infisical` (disabled) — ADR-0066; V2-native `mcp.servers` |
| `.githooks/`       | Conventional Commits gate (`commit-msg`) + `.commitlintrc.json` — ADR-0065 |
| `skills-lock.json` | **15** entries: 13 Matt core skills and 2 Neon skills. The ADR-0063 Matt additions (`pr`, `writing-for-agents`) are not yet in the lock — update via the official `skills` CLI, never by hand |
| RTK / Headroom | Owner-level optional tools; neither is configured or required by the repository |

Root `AGENTS.md` is the shared project instruction file. `.cursor/`, `.codex/`, and `.claude/` customizations are absent by ADR-0041.

### ABSENT project-local (verified)

Graphify rule / `graphify-out/` · watermarks project rule · `product-marketing` skill

---

## USER-GLOBAL (PRESENT ambient; not AUTHORIZED Sonivo deps)

| Item                          | Status                                |
| ----------------------------- | ------------------------------------- |
| Taste / Emil / design cluster | USER-GLOBAL ambient — do not depend   |
| RTK 1.1.0 OSS                  | Owner-level optional CLI; not a Sonivo dependency |
| Headroom MCP                  | Available to the current Codex host; not a Sonivo dependency |
| Graphify CLI                  | USER-GLOBAL — UNAUTHORIZED for Sonivo |
| Context7                      | USER-GLOBAL — UNAUTHORIZED / DEFERRED |
| watermarks-remover            | USER-GLOBAL — UNAUTHORIZED            |
| webappsec-review              | USER-GLOBAL ambient — do not depend   |

---

## Provenance

| Item                     | Evidence                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Matt core skills         | `mattpocock/skills` via lock hashes; git commit **UNKNOWN**; upstream removed `resolving-merge-conflicts` (keep local copy)      |
| Matt ADR-0063 additions  | `pr`, `writing-for-agents` from `mattpocock/skills`; not yet in lockfile                                                         |
| .NET platform skills     | `dotnet/skills` (Microsoft .NET team); audited SKILL.md + references                                                            |
| Anthropic skill-creator  | `anthropics/skills`; bundles optional Python eval scripts                                                                       |
| Trail of Bits            | `trailofbits/skills`; differential-review (methodology + references)                                                            |
| creative-frameworks      | User-authored 2026-10-04                                                                                                        |
| ADR-0064 security skills | Authored for Sonivo 2026-10-05; adapted to the ASP.NET Core / React stack (not third-party imports)                              |
| Impeccable               | Project-local; not in lockfile; commit **UNKNOWN**                                                                              |
| Knowledge workflows      | Adapted from user-provided `opencode-obsidian-memory-full.zip`; project-local under `.agents/skills/`; authorized by ADR-0039    |
| Layout decision          | Root `AGENTS.md` plus sole project-local `.agents/skills/` tree; vendor customizations removed by ADR-0041                      |
| Taste/Emil               | USER-GLOBAL; **UNKNOWN ORIGIN**; created 2026-09-03                                                                             |
| `caveman`                 | [Upstream skill](https://github.com/JuliusBrussee/caveman/tree/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4/skills/caveman), commit `9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4`; skill-only, Apache-2.0; upstream `LICENSE` and `NOTICE` retained |
| `ponytail`                | [Upstream skill](https://github.com/DietrichGebert/ponytail/tree/09c434ab73ca43761c5d8b0c5d341926c2fba710/skills/ponytail), commit `09c434ab73ca43761c5d8b0c5d341926c2fba710`; skill-only, MIT; upstream `LICENSE` retained |
| `ponytail-review`         | Authored for Sonivo under ADR-0103; user-invoked and limited to over-engineering findings |
| `headroom-context`        | Authored for Sonivo under ADR-0103; optional connector use only for non-sensitive content |
| RTK                      | `rtk-ai/rtk` v1.1.0 `rtk-oss-x86_64-pc-windows-msvc.zip`; SHA-256 `9b076379be9d86011ca3f3a0264d0be4851da5535453a47f67fa46b4e893fbb2`; installed to owner profile, not tracked |
