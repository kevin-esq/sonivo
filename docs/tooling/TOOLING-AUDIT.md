# TOOLING-AUDIT.md — Sonivo

**Phase 0 status:** **CLOSED** (Phase 0.9 documentation reconciliation, 2026-09-15)  
**Tooling policy:** **AUTHORIZED** (Phase 0.8 prune executed; ADR-0002 **ACCEPTED**)  
**Phase 0.9:** Documentation reconciliation only — **no** installs, uninstalls, or tooling changes.  
**Rule:** `DOCUMENTED ≠ VERIFIED PRESENT ≠ APPROVED/AUTHORIZED` · Sonivo allowlist is binding.

---

## Authorized policy (binding)

### CORE — PROJECT-LOCAL — AUTHORIZED

`grill-with-docs` · `domain-modeling` · `to-spec` · `to-tickets` · `tdd` · `implement` · `code-review` · `diagnosing-bugs` · `codebase-design`

### SPECIALIZED — PROJECT-LOCAL — AUTHORIZED (invoke only when required)

`impeccable` · `grilling` · `prototype` · `research` · `resolving-merge-conflicts`

### DEFERRED — do not install, configure, invoke, or depend

`setup-matt-pocock-skills` · `handoff` · `product-marketing` · Context7 · all surplus Matt Pocock skills

### REJECTED — do not install or configure

`wayfinder` · `git-guardrails-claude-code` · `migrate-to-shoehorn` · `scaffold-exercises`

### Scope

All CORE and SPECIALIZED skills: **PROJECT-LOCAL**.  
No new tooling installations are authorized without an explicit future human decision.

---

## Project-local verified state (14 skill directories)

**13 Matt Pocock + 1 Impeccable** under `.agents/skills/`:

`codebase-design` · `code-review` · `diagnosing-bugs` · `domain-modeling` · `grilling` · `grill-with-docs` · `impeccable` · `implement` · `prototype` · `research` · `resolving-merge-conflicts` · `tdd` · `to-spec` · `to-tickets`

Also kept: `.cursor/skills/impeccable/`, Impeccable agents/hooks, `skills-lock.json` (**13** Matt entries only).

| Artifact | State |
| -------- | ----- |
| Graphify project rule / `graphify-out/` | **ABSENT** (removed Phase 0.8) |
| Watermarks project rule | **ABSENT** (removed Phase 0.8) |
| `product-marketing` | **ABSENT** (deferred; removed Phase 0.8) |

---

## Phase 0.8 prune (completed)

Removed surplus/deferred/rejected Matt dirs + `product-marketing`; removed `.cursor/rules/graphify.mdc`, `graphify-out/`, `.cursor/rules/clean-user-facing-text.mdc`.  
See Phase 0.8 history in repo conversation / prior audit versions if needed. Full removal name list was recorded at prune time.

---

## Unauthorized / ambient USER-GLOBAL tooling (documented, not touched)

| Item | Classification | Sonivo policy |
| ---- | -------------- | ------------- |
| Graphify CLI | UNAUTHORIZED user-global | Do not depend; not project-local |
| Context7 | UNAUTHORIZED / DEFERRED user-global | Do not configure or depend |
| watermarks-remover | UNAUTHORIZED user-global | Do not depend; project-local artifacts removed |
| Taste / Emil (and related design cluster) | Ambient user-global | Must not become a Sonivo reproducibility dependency |

---

## ADR-0002

**ACCEPTED** — policy matches the Phase 0.8 allowlist above.

---

## Confirmation

| Phase | Actions |
| ----- | ------- |
| 0.8 | Project-local prune + lock prune + ADR-0002 ACCEPT |
| 0.9 | Docs + `AGENTS.md` + obsolete `.gitignore` `graphify-out/` entry only |

**Did not (0.9):** change skills, MCP, CLIs, packages, lock skill hashes, globals, credentials, Git init, app code, or schema.
