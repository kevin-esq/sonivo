# SKILLS-INVENTORY.md — Sonivo

**Phase 0 status:** **CLOSED** (Phase 0.9, 2026-09-15)  
**Allowlist:** **AUTHORIZED** (ADR-0002 **ACCEPTED**, extended by ADR-0039/0041)

Distinguish: **PRESENT** (on disk) · **AUTHORIZED** (Sonivo allowlist) · **DEFERRED** · **REJECTED** · **USER-GLOBAL**

---

## AUTHORIZED allowlist (binding)

### CORE — PROJECT-LOCAL

`grill-with-docs` · `domain-modeling` · `to-spec` · `to-tickets` · `tdd` · `implement` · `code-review` · `diagnosing-bugs` · `codebase-design`

### SPECIALIZED — PROJECT-LOCAL

`impeccable` · `grilling` · `prototype` · `research` · `resolving-merge-conflicts`

### KNOWLEDGE WORKFLOWS — PROJECT-LOCAL (ADR-0039)

`knowledge-architecture` · `knowledge-retrieval` · `memory-writeback` · `knowledge-maintenance` · `context-optimization` · `project-documentation` · `decision-record` · `session-handoff`

### DEFERRED (not installed project-local; do not invoke/depend)

`setup-matt-pocock-skills` · `handoff` · `product-marketing` · Context7 · surplus Matt skills

### REJECTED (not installed; do not install)

`wayfinder` · `git-guardrails-claude-code` · `migrate-to-shoehorn` · `scaffold-exercises`

---

## PRESENT project-local skills (allowlist + 1 user-authorized exception)

**23** directories under `.agents/skills/` — **22** allowlisted plus **1** user-authorized exception (see below):

| Directory                   | Role        |
| --------------------------- | ----------- |
| `codebase-design`           | CORE        |
| `code-review`               | CORE        |
| `diagnosing-bugs`           | CORE        |
| `domain-modeling`           | CORE        |
| `grilling`                  | SPECIALIZED |
| `grill-with-docs`           | CORE        |
| `impeccable`                | SPECIALIZED |
| `implement`                 | CORE        |
| `prototype`                 | SPECIALIZED |
| `research`                  | SPECIALIZED |
| `resolving-merge-conflicts` | SPECIALIZED |
| `tdd`                       | CORE        |
| `to-spec`                   | CORE        |
| `to-tickets`                | CORE        |
| `context-optimization`      | KNOWLEDGE   |
| `decision-record`           | KNOWLEDGE   |
| `knowledge-architecture`    | KNOWLEDGE   |
| `knowledge-maintenance`     | KNOWLEDGE   |
| `knowledge-retrieval`       | KNOWLEDGE   |
| `memory-writeback`          | KNOWLEDGE   |
| `project-documentation`     | KNOWLEDGE   |
| `session-handoff`           | KNOWLEDGE   |
| `creative-frameworks`       | EXCEPTION   |

= **13** Matt Pocock + **1** Impeccable + **8** ADR-0039 knowledge workflows (**AUTHORIZED**) + **1** user-authorized exception (`creative-frameworks`, **NOT** in the binding allowlist).

> **User-authorized exception (2026-10-04):** `creative-frameworks` is present and discoverable by OpenCode but is **not** part of the ADR-0002/0039/0041 binding allowlist. It was added under explicit user authorization that overrode the documented prohibition. Requires a ratifying ADR or removal.

Removed skills are **not** listed as installed.

### Related project-local config

| Path               | Notes                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| `.agents/skills/`  | Sole project-local skills directory; contains 22 authorized + 1 user-authorized exception `SKILL.md` procedures |
| `.obsidian/`       | Local vault configuration; intentionally not modified                                 |
| `skills-lock.json` | **13** Matt entries only; local memory workflows are not external packages            |

Root `AGENTS.md` is the shared project instruction file. `.cursor/`, `.codex/`, and `.claude/` customizations are absent by ADR-0041.

### ABSENT project-local (verified)

Graphify rule / `graphify-out/` · watermarks project rule · `product-marketing` skill

---

## USER-GLOBAL (PRESENT ambient; not AUTHORIZED Sonivo deps)

| Item                          | Status                                |
| ----------------------------- | ------------------------------------- |
| Taste / Emil / design cluster | USER-GLOBAL ambient — do not depend   |
| Graphify CLI                  | USER-GLOBAL — UNAUTHORIZED for Sonivo |
| Context7                      | USER-GLOBAL — UNAUTHORIZED / DEFERRED |
| watermarks-remover            | USER-GLOBAL — UNAUTHORIZED            |
| webappsec-review              | USER-GLOBAL ambient — do not depend   |

---

## Provenance

| Item                | Evidence                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Matt skills         | `mattpocock/skills` via lock hashes; git commit **UNKNOWN**                                                                   |
| Impeccable          | Project-local; not in lockfile; commit **UNKNOWN**                                                                            |
| Knowledge workflows | Adapted from user-provided `opencode-obsidian-memory-full.zip`; project-local under `.agents/skills/`; authorized by ADR-0039 |
| Layout decision     | Root `AGENTS.md` plus sole project-local `.agents/skills/` tree; vendor customizations removed by ADR-0041                    |
| Taste/Emil          | USER-GLOBAL; **UNKNOWN ORIGIN**; created 2026-09-03                                                                           |
