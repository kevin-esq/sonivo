# SKILLS-INVENTORY.md — Sonivo

**Phase 0 status:** **CLOSED** (Phase 0.9, 2026-09-15)  
**Allowlist:** **AUTHORIZED** (ADR-0002 **ACCEPTED**; Phase 0.8 prune verified)

Distinguish: **PRESENT** (on disk) · **AUTHORIZED** (Sonivo allowlist) · **DEFERRED** · **REJECTED** · **USER-GLOBAL**

---

## AUTHORIZED allowlist (binding)

### CORE — PROJECT-LOCAL

`grill-with-docs` · `domain-modeling` · `to-spec` · `to-tickets` · `tdd` · `implement` · `code-review` · `diagnosing-bugs` · `codebase-design`

### SPECIALIZED — PROJECT-LOCAL

`impeccable` · `grilling` · `prototype` · `research` · `resolving-merge-conflicts`

### DEFERRED (not installed project-local; do not invoke/depend)

`setup-matt-pocock-skills` · `handoff` · `product-marketing` · Context7 · surplus Matt skills

### REJECTED (not installed; do not install)

`wayfinder` · `git-guardrails-claude-code` · `migrate-to-shoehorn` · `scaffold-exercises`

---

## PRESENT project-local skills (filesystem = allowlist)

Exactly **14** directories under `.agents/skills/`:

| Directory | Role |
| --------- | ---- |
| `codebase-design` | CORE |
| `code-review` | CORE |
| `diagnosing-bugs` | CORE |
| `domain-modeling` | CORE |
| `grilling` | SPECIALIZED |
| `grill-with-docs` | CORE |
| `impeccable` | SPECIALIZED |
| `implement` | CORE |
| `prototype` | SPECIALIZED |
| `research` | SPECIALIZED |
| `resolving-merge-conflicts` | SPECIALIZED |
| `tdd` | CORE |
| `to-spec` | CORE |
| `to-tickets` | CORE |

= **13** Matt Pocock (**AUTHORIZED**) + **1** Impeccable (**AUTHORIZED**)

Removed skills are **not** listed as installed.

### Related project-local config (PRESENT, supports AUTHORIZED Impeccable)

| Path | Notes |
| ---- | ----- |
| `.cursor/skills/impeccable/` | Engine **0.1.5**; skill metadata **4.3.1** |
| `.cursor/agents/impeccable-*.md` | Agent stubs |
| `.cursor/hooks.json` / `.codex/hooks.json` | Impeccable hooks |
| `skills-lock.json` | **13** Matt entries only |

### ABSENT project-local (verified)

Graphify rule / `graphify-out/` · watermarks project rule · `product-marketing` skill

---

## USER-GLOBAL (PRESENT ambient; not AUTHORIZED Sonivo deps)

| Item | Status |
| ---- | ------ |
| Taste / Emil / design cluster | USER-GLOBAL ambient — do not depend |
| Graphify CLI | USER-GLOBAL — UNAUTHORIZED for Sonivo |
| Context7 | USER-GLOBAL — UNAUTHORIZED / DEFERRED |
| watermarks-remover | USER-GLOBAL — UNAUTHORIZED |

---

## Provenance

| Item | Evidence |
| ---- | -------- |
| Matt skills | `mattpocock/skills` via lock hashes; git commit **UNKNOWN** |
| Impeccable | Project-local; not in lockfile; commit **UNKNOWN** |
| Taste/Emil | USER-GLOBAL; **UNKNOWN ORIGIN**; created 2026-09-03 |
