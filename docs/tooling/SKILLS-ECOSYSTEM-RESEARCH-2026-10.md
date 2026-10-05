# SKILLS-ECOSYSTEM-RESEARCH-2026-10.md — Sonivo

**Date:** 2026-10-04
**Question:** Are Sonivo's project-local agent skills the right set, or are there better/necessary
alternatives? (Detailed internet research.)
**Method:** Primary sources only — official repositories and vendor docs. No secondary blog claims
without a first-party source.
**Outcome:** Adopted a focused set of official skills; see **ADR-0063**.

---

## 1. How a skill is judged (2026)

Anthropic (Agent Skills spec + engineering guidance) and Red Hat converge on:

- **`description` = what it does + when to use it.** It is the only field always loaded; the body
  is loaded on demand. A vague description = the skill never triggers.
- **`SKILL.md` < ~500 lines.** Move heavy/optional content to reference files, **one level deep**.
- **Progressive disclosure / degrees of freedom per step**, not uniform across the skill.
- **Audit the source.** Skills can contain scripts and external fetches; treat them as code.
  Anthropic explicitly warns to install only from trusted sources and to audit bundled files.

Sonivo already enforces this more rigorously than most: a **binding allowlist** (ADR-0002/0039/0041),
`skills-lock.json` with hashes, and a "no install without approval" rule. That is a strength.

---

## 2. Ecosystem map (first-party)

| Collection | Authority | Scale | What it is |
| ---------- | --------- | ----- | ---------- |
| [`mattpocock/skills`](https://github.com/mattpocock/skills) | Matt Pocock (ex-Vercel/Stately) | ~135k–170k★ | Small, composable engineering-discipline skills. **Sonivo's base.** |
| [`obra/superpowers`](https://github.com/obra/superpowers) | Jesse Vincent / Prime Radiant | ~89k★ | Full methodology (brainstorm→plan→TDD→subagents→review). Telemetry on by default. |
| [`anthropics/skills`](https://github.com/anthropics/skills) | Anthropic (official) | ~177k★ | `webapp-testing`, `skill-creator`, `frontend-design`, docx/pdf/xlsx/pptx, spec + template. |
| [`dotnet/skills`](https://github.com/dotnet/skills) | **Microsoft .NET team** | ~5.3k★ | ASP.NET Core, EF Core, MSBuild, NuGet, diagnostics, tests, C# MCP servers. |
| [`trailofbits/skills`](https://github.com/trailofbits/skills) | Trail of Bits | — | Security: differential-review, static-analysis, supply-chain-risk-auditor, insecure-defaults. |
| [awesome-claude-skills](https://github.com/topics/claude-skills) / [VoltAgent](https://github.com/VoltAgent/awesome-agent-skills) | Community | 15k–75k★ | 1000+ skills, highly variable quality; large supply-chain surface. |
| [Playwright skills](https://playwright.dev/agent-cli/skills) | Microsoft | — | `playwright-cli install --skills=agents` → `.agents/skills/`. |

Spec: [agentskills.io](https://agentskills.io) · Anthropic authoring guidance:
[engineering blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) ·
[docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).

---

## 3. Assessment of Sonivo's original 22 skills

**Strong / keep as-is**

- The **13 Matt Pocock** skills are the highest-authority choice for engineering discipline.
- `impeccable` covers frontend/UX well.
- The **8 knowledge workflows** (ADR/glossary/handoff) are unusual but coherent with Sonivo's
  docs-first model.

**Overlap worth reviewing (not blocking)**

- `grill-with-docs` + `domain-modeling` already build glossary/ADRs, so `project-documentation`
  and `decision-record` can overlap.
- `context-optimization` behaves more like an `AGENTS.md` rule than a skill.
- Upstream drift: the pin predates Matt's newer `pr`, `retro`, `triage`,
  `improve-codebase-architecture`, `writing-for-agents`, `implement-spec`.

**Gaps (the real finding)**

1. **No .NET/ASP.NET Core/EF Core/PostgreSQL skill** — the actual stack was uncovered.
2. **No formalized web/E2E testing skill** (the Playwright MCP was added, but no procedure).
3. **No security-review skill** (only user-global `webappsec-review` + ADR-0044 tooling).
4. **No skill-authoring skill**, despite maintaining 22+ skills.

---

## 4. What was adopted (ADR-0063)

Installed under `.agents/skills/` from official sources, after auditing frontmatter and bundled files:

| Skill | Source | Why |
| ----- | ------ | --- |
| `dotnet-webapi` | Microsoft .NET | ASP.NET Core Web API correctness |
| `optimizing-ef-core-queries` | Microsoft .NET | EF Core performance |
| `create-datadriven-aspnetcore` | Microsoft .NET | Data-driven endpoints |
| `csharp-refactoring` | Microsoft .NET | Safe C# refactors |
| `skill-creator` | Anthropic | Maintain/measure the skill set |
| `writing-for-agents` | Matt Pocock | Write skills/`AGENTS.md` well |
| `pr` | Matt Pocock | PR body shape |
| `differential-review` | Trail of Bits | Security review of a diff |

Plus the previously installed `creative-frameworks` (user-authored) and the root
`opencode.json` MCP servers (`drawio`, `excalidraw`, `sequential-thinking`, `fetch`).

---

## 5. Deliberately not installed (and why)

- **`obra/superpowers`** — duplicates the discipline set, enables telemetry by default, and its
  subagent-driven model conflicts with Sonivo's no-delegation rule.
- **`webapp-testing` (Anthropic)** — Python-oriented; Sonivo's `e2e/` is TypeScript and the
  Playwright MCP already covers browser automation. Re-evaluate if a TS-native variant appears.
- **`frontend-design` (Anthropic)** — overlaps `impeccable`.
- **MSTest `dotnet-test` skills** — Sonivo uses **xUnit**; those are framework-specific.
- **Third-party `prompt-engineering`** — unaudited; can be authored project-local if needed.
- **Bulk update of the 13 Matt skills** — upstream removed `resolving-merge-conflicts`; a clean
  overwrite is unsafe. Requires a dedicated, reviewed update.

---

## 6. Risks / cautions

- Every third-party skill is code: audit scripts, network calls, and bundled assets before install.
- `skill-creator` ships Python eval scripts; they are optional and only run if invoked.
- `skills-lock.json` must be updated by the official `skills` CLI, not by hand (its hash algorithm
  could not be reproduced with plain sha256, so hand edits would be wrong).
- Adding skills grows the always-loaded `description` surface; prefer few and sharp.

---

## 7. Sources

- https://github.com/mattpocock/skills
- https://github.com/obra/superpowers
- https://github.com/anthropics/skills
- https://github.com/dotnet/skills
- https://github.com/trailofbits/skills
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://playwright.dev/agent-cli/skills
- https://github.com/topics/claude-skills · https://github.com/VoltAgent/awesome-agent-skills
