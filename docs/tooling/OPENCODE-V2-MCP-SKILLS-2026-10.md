# OPENCODE-V2-MCP-SKILLS-2026-10.md — Sonivo

**Date:** 2026-10-05
**Status:** Applied — **user-authorized 2026-10-05** ("hazlo y documenta todo").
**Decision:** [ADR-0064](../03-architecture/DECISIONS.md), [ADR-0065](../03-architecture/DECISIONS.md)
**Scope:** How MCP servers and Agent Skills are installed in the current OpenCode
(**V2**), the corrections to a circulated "security setup" tutorial, and the
concrete changes adopted in this repository.

---

## 1. How MCP servers are installed (OpenCode V2)

Two equivalent ways; prefer the CLI so unrelated configuration is preserved.

**CLI**

```sh
opencode mcp add context7 --url https://mcp.context7.com/mcp      # remote, project
opencode mcp add everything --global -- npx -y @modelcontextprotocol/server-everything
opencode mcp list          # connection state
opencode mcp auth <name>   # OAuth
opencode mcp logout <name>
```

In the TUI, run `/mcps` to view/connect/authenticate; **Space** toggles a server.

**Configuration** (`opencode.json` / `opencode.jsonc`, project or global)

- V2 nests servers under **`mcp.servers.<name>`** (V1 put names directly under `mcp`).
- To keep a server configured **without connecting**, set **`disabled: true`**
  (V2 has no `enabled` field).
- Local: `type: "local"`, `command: [...]`, optional `cwd`, `environment`.
- Remote: `type: "remote"`, absolute `url`, optional `headers`, `oauth`.
- Secrets use **`{env:NAME}`** substitution. Shell-style `$NAME` is **not**
  expanded inside JSON.
- Tools are exposed as `<server>_<tool>`; by default they go through **Code Mode**
  (`codemode: true`). MCP tools consume model context — add only what is needed.
- Per-server `timeout` and `protocol` are supported.

## 2. How Agent Skills are installed (OpenCode V2)

Skills are **file-discovered**, not "installed" by a command.

| Scope | Locations |
| ----- | --------- |
| Project | `.opencode/skills/`, `.claude/skills/`, `.agents/skills/` |
| Global | `~/.config/opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| Extra | array `skills: [...]` in `opencode.json` (paths or HTTP catalogs) |

- Form: `skills/<id>/SKILL.md` (preferred) or `skills/<id>.md`.
- The **ID comes from the path** and is case-sensitive; the frontmatter `name` is a
  display label.
- Useful frontmatter: `name`, `description` (needed for the model to discover it),
  and `metadata.opencode/autoinvoke: false` / `disable-model-invocation` to hide it.
- V2 does **not** enforce lowercase-kebab IDs or a match between `name` and the
  directory (V1 did).
- Permissions use the `skill` action with the skill ID as the resource.

**Sonivo convention:** the sole project-local skills directory is
`.agents/skills/` (ADR-0041). Do not create `.opencode/skills/` or vendor trees.

## 3. Corrections to the circulated tutorial

| Tutorial claim | Reality (OpenCode V2) |
| -------------- | --------------------- |
| MCP under `mcp.servers` | ✅ Correct for V2 (V1 used `mcp` directly). |
| `"enabled": true` | ❌ Use `disabled: true` to opt out; no `enabled` field. |
| `{env:SNYK_TOKEN}` | ✅ Correct. |
| Remote `url: "https://nextjs.org"` | ❌ Not an MCP endpoint; needs a Streamable HTTP MCP URL. |
| `"tools": { "<mcp>": true }` | ❌ V1 shape; V2 uses `permissions: [{action, resource, effect}]`. |
| `opencode /init` generates `AGENTS.md` | ❌ No `/init` in V2 docs; `AGENTS.md` is read automatically. |
| Frontmatter `---name: ... description: ...---` on one line | ❌ Invalid YAML; fields need line breaks. |
| **Tab** toggles Plan/Build | ❌ V2 cycles agents with **Shift+Tab** (`agent.cycle`). |
| `/mcps` + Space | ✅ Correct (`mcp.list`, `dialog.mcp.toggle` = space). |

The tutorial also targeted a **Next.js** stack; Sonivo is React 19 + Vite +
Tailwind (frontend) and .NET 9 / ASP.NET Core (backend), so its "skills" were
re-authored to match this repo.

## 4. Adopted for Sonivo (2026-10-05)

### 4.1 `opencode.json` migrated to V2-native

- Moved servers under `mcp.servers`; removed the V1-style `enabled: true` flags.
- Existing servers kept: `drawio`, `excalidraw`, `sequential-thinking`, `fetch`.

### 4.2 MCP servers added

| Server | Type | Command | State |
| ------ | ---- | ------- | ----- |
| `semgrep` | local | `uvx --from semgrep semgrep mcp -t stdio` | **enabled** — SAST scanning, no token required; 120 s startup/catalog timeout |
| `snyk` | local | `npx -y snyk@latest mcp -t stdio` | **enabled** — authenticate via `snyk_auth` (or `SNYK_TOKEN`); 180 s startup timeout |

The `semgrep-mcp` PyPI package requires a separate `semgrep` binary on `PATH` and
therefore exits at startup; using the Semgrep CLI's own MCP server via
`uvx --from semgrep ...` bundles the binary in one ephemeral environment. This was
verified connected via `opencode mcp list` and exposes the `semgrep_*` tools
(scan, AST, rule schema, supported languages).
`snyk` starts without a token but scanning requires sign-in: run `snyk_auth`
(or set `SNYK_TOKEN`). Both servers were verified connected via `opencode mcp list`.

### 4.3 Project-local skills added

Under `.agents/skills/` (Sonivo-only, per ADR-0041):

- `dotnet-secure-architecture` — ASP.NET Core / EF Core / Identity / tenancy
  hardening and review.
- `react-frontend-security` — React 19 / Vite / Tailwind XSS, env-leak, token and
  client-authz review.

### 4.4 GitHub MCP server (ADR-0065)

- `github` — local Docker, `ghcr.io/github/github-mcp-server`, token via
  `GITHUB_PERSONAL_ACCESS_TOKEN`, toolsets limited to
  `context,repos,pull_requests,actions,git`. Verified connected; `get_me`
  returns the authenticated user.

**Why local Docker and not the hosted remote:** OpenCode V2 does not interpolate
`{env:...}` when it is embedded inside a larger header string, so
`Authorization: "Bearer {env:GITHUB_PERSONAL_ACCESS_TOKEN}"` was sent malformed
(HTTP 400). Passing the token as a real environment variable to the local Docker
server avoids this. That variable must be present in the OpenCode **service**
environment; `opencode service set env` alone did not reach the MCP spawn —
exporting it and restarting the service did. It is persisted with `setx` on
Windows.

### 4.5 Git governance (ADR-0065)

- Project-local skill `git-governance` plus `.githooks/commit-msg` (commitlint
  when available, POSIX fallback otherwise) and `.commitlintrc.json`.
- Enable once per clone: `git config core.hooksPath .githooks`.
- Git actions (commit / push / PR / merge) remain **human-authorized**; no
  autonomous `gh pr create`.

## 5. Verification

```sh
opencode mcp list         # expect semgrep, snyk and github connected
opencode debug config     # confirm merged configuration
opencode reload           # reload config without restarting the server
```

The two new skills appear in the agent's available-skills list automatically
(`.agents/skills/<id>/SKILL.md`). They are project-local; no user-global tooling
is required.

## 6. Firewall

- `snyk` scans require sign-in (`snyk_auth`); if a token is used it is supplied via
  `{env:SNYK_TOKEN}` and never committed.
- No new user-global tooling becomes a Sonivo dependency (`PRESENT ≠ AUTHORIZED`).
- All new skills live under `.agents/skills/`; no parallel vendor trees.
- Further skill/MCP additions still require explicit human authorization.
