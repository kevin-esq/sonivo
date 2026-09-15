# Install log

**Session:** 2026-09-15  
**Approved by:** user (explicit install request)

---

## Watermarks remover

| Item | Detail |
| ---- | ------ |
| Repo | https://github.com/guillaumemeyer/watermarks-remover |
| Clone | `C:\Users\Maria\tools\watermarks-remover` |
| Skills | `remove-ai-marks`, `clean-user-facing-text` → `~\.cursor\skills\` (force-refreshed) |
| Service | `python service/scripts/server.py --host 127.0.0.1 --port 8765` — `/health` OK |
| Launcher VBS | `C:\Users\Maria\tools\watermarks-remover\start-service.vbs` |
| Autostart task | **FAILED** (`Register-ScheduledTask` Access Denied). Run docs steps manually if desired. |
| Project rule | `.cursor/rules/clean-user-facing-text.mdc` |

---

## Graphify

| Item | Detail |
| ---- | ------ |
| CLI | Already present (`graphify 0.8.22`) |
| Cursor rule | `.cursor/rules/graphify.mdc` (`graphify cursor install --project`) |
| Graph | `graphify update . --no-cluster` → `graphify-out/graph.json` (~3.4 MB, AST; gitignored) |
| Semantic extract | Failed (Gemini 503). Retry later with `graphify extract .` |

---

## Context7

| Item | Detail |
| ---- | ------ |
| Setup | `npx ctx7 setup --cursor --mcp -y` (OAuth + API key) |
| MCP | Global `~\.cursor\mcp.json` entry `context7` |
| Rule | `~\.cursor\rules\context7.mdc` |
| Skill | `~\.cursor\skills\context7-mcp\` |
| Note | API key lives only in user MCP config — never commit |

---

## Skills (audit “READY TO APPROVE”)

| Package | Scope | Location |
| ------- | ----- | -------- |
| Matt Pocock `mattpocock/skills` | Project | `.agents/skills/*` (37 skills; non-interactive install took all) |
| Impeccable | Project | `.cursor/skills/impeccable`, `.agents/skills/impeccable` (+ hooks/agents) |
| `product-marketing` | Project | `.agents/skills/product-marketing` |

Already present (user-global, not reinstalled as packages): Taste, Emil family, design stack, etc.

---

## Organization

| Item | Detail |
| ---- | ------ |
| `.scratch/` | Agent working memory (`NOW.md`, this log) |
| `.gitignore` | Added for scratch notes, graphify-out, impeccable binaries, `.env` |
| Rule | `.cursor/rules/sonivo-scratch.mdc` |
