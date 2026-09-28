# Install log

**Session:** 2026-09-15  
**Approved by:** user (explicit install request)

---

## Watermarks remover

| Item           | Detail                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| Repo           | https://github.com/guillaumemeyer/watermarks-remover                                     |
| Clone          | `C:\Users\Maria\tools\watermarks-remover`                                                |
| Skills         | `remove-ai-marks`, `clean-user-facing-text` → `~\.cursor\skills\` (force-refreshed)      |
| Service        | `python service/scripts/server.py --host 127.0.0.1 --port 8765` — `/health` OK           |
| Launcher VBS   | `C:\Users\Maria\tools\watermarks-remover\start-service.vbs`                              |
| Autostart task | **FAILED** (`Register-ScheduledTask` Access Denied). Run docs steps manually if desired. |
| Project rule   | `.cursor/rules/clean-user-facing-text.mdc`                                               |

---

## Graphify

| Item             | Detail                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| CLI              | Already present (`graphify 0.8.22`)                                                     |
| Cursor rule      | `.cursor/rules/graphify.mdc` (`graphify cursor install --project`)                      |
| Graph            | `graphify update . --no-cluster` → `graphify-out/graph.json` (~3.4 MB, AST; gitignored) |
| Semantic extract | Failed (Gemini 503). Retry later with `graphify extract .`                              |

---

## Context7

| Item  | Detail                                               |
| ----- | ---------------------------------------------------- |
| Setup | `npx ctx7 setup --cursor --mcp -y` (OAuth + API key) |
| MCP   | Global `~\.cursor\mcp.json` entry `context7`         |
| Rule  | `~\.cursor\rules\context7.mdc`                       |
| Skill | `~\.cursor\skills\context7-mcp\`                     |
| Note  | API key lives only in user MCP config — never commit |

---

## Skills (audit “READY TO APPROVE”)

| Package                         | Scope   | Location                                                                  |
| ------------------------------- | ------- | ------------------------------------------------------------------------- |
| Matt Pocock `mattpocock/skills` | Project | `.agents/skills/*` (37 skills; non-interactive install took all)          |
| Impeccable                      | Project | `.cursor/skills/impeccable`, `.agents/skills/impeccable` (+ hooks/agents) |
| `product-marketing`             | Project | `.agents/skills/product-marketing`                                        |

Already present (user-global, not reinstalled as packages): Taste, Emil family, design stack, etc.

---

## Organization

| Item         | Detail                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------- |
| `.scratch/`  | Agent working memory (`NOW.md`, this log)                                                     |
| `.gitignore` | Added for scratch notes, graphify-out, impeccable binaries, `.env`                            |
| Rule         | `.cursor/rules/sonivo-scratch.mdc` was migrated to root `AGENTS.md` and removed on 2026-09-28 |

---

## Obsidian memory workflows (2026-09-28)

| Item                    | Detail                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source                  | User-provided `opencode-obsidian-memory-full.zip`                                                                  |
| Authorization           | Explicit user request; recorded as ADR-0039                                                                        |
| Location                | Eight adapted Markdown skills under `.agents/skills/`                                                              |
| Knowledge source        | Existing `docs/` remains canonical; Obsidian entry point is `docs/00-context/INDEX.md`                             |
| Current work state      | `.scratch/NOW.md` (single tracked checkpoint note)                                                                 |
| Adaptation              | Replaced OpenCode `knowledge/` paths with Sonivo docs/scratch conventions; did not copy empty scaffold directories |
| External dependencies   | None; `skills-lock.json` unchanged                                                                                 |
| Local Obsidian settings | `.obsidian/` left unchanged                                                                                        |

Historical inventory above reflects the 2026-09-15 audit. Current authorization and filesystem state are maintained in `docs/tooling/TOOLING-AUDIT.md` and `docs/tooling/SKILLS-INVENTORY.md`.

---

## Single project-local customization tree (2026-09-28)

| Item                | Detail                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Authorization       | User-approved; recorded as ADR-0041, superseding ADR-0040                                                           |
| Global instructions | Root `AGENTS.md`                                                                                                    |
| Skills              | 22 canonical procedures in `.agents/skills/<name>/SKILL.md`                                                         |
| Removed             | `.cursor/`, `.codex/`, and `.claude/` customizations; the duplicate Cursor scratch rule was migrated to `AGENTS.md` |
| Consequence         | Cursor/Codex hooks and Cursor-only Impeccable subagents no longer run                                               |
| Dependencies        | None added; `skills-lock.json` unchanged                                                                            |
