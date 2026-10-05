# DECISIONS.md — Sonivo

Architecture Decision Records.

**Statuses:** `PROPOSED` | `ACCEPTED` | `SUPERSEDED`

Only **ACCEPTED** ADRs bind implementation. Newest first.

---

## ADR-0068 - Email: provider-agnostic transport (Resend today)

- **Status:** **ACCEPTED** - user-authorized 2026-10-05.
- **Supersedes:** the "Gmail API HTTPS only / no generic transport" email rule in the Phase 3.9 verification-mail decisions and the AGENTS.md email firewall line. The Event/RSVP-mail firewall is unchanged.
- **Related:** ADR-0037 (security headers), PHASE-AUTH-SPEC (T-AU-01).

### Decision

1. Transactional email is sent through a single provider-agnostic abstraction (`IEmailSender`). Its concrete transport (`HttpEmailSender`) posts a JSON message to a configured endpoint with a bearer key.
2. The provider is an infrastructure detail expressed only through configuration (`Email:Endpoint`, `Email:ApiKey`, `Email:From`). The source code names no vendor — no Gmail, SMTP, or Resend identifiers.
3. Best-effort posture is unchanged: transport failures never throw; they degrade to `mailed=false` plus a warning log.
4. The provider configured today is Resend. Switching providers is a configuration change, not a code change.
5. Event/RSVP mail and any future mail category stay governed by their own firewalls.

### Firewall

- No vendor name in source. No inbound mail handling. No marketing/broadcast mail.

---

## ADR-0067 - Frontend shell: Next.js App Router BFF + host-based tenancy + handoff session

- **Status:** **ACCEPTED** - user-authorized 2026-10-05.
- **Amends:** ADR-0010 (frontend row + "Do not introduce Next.js" principle). The .NET backend decision stands.
- **Unblocks:** ADR-0049 (host/subdomain work; was documentation-only/BLOCKED).
- **Extends:** ADR-0043 (i18n) to Portuguese; backend strings stay phase 2.
- **See:** [`PHASE-NEXTJS-MULTITENANT-BFF-SPEC.md`](./PHASE-NEXTJS-MULTITENANT-BFF-SPEC.md).

### Decision

1. A **Next.js App Router** frontend is adopted as the product shell, operating as a **BFF over the existing ASP.NET Core API**. The .NET modular monolith remains the single backend; Next never accesses PostgreSQL.
2. **Host-based tenancy:** `slug.sonvo.lat` is rewritten by middleware to internal `/[tenant]/[locale]/...` routes; the apex serves marketing/auth. The tenant slug from `Host` is a **selector**, never authorization.
3. **i18n:** Spanish default, English + Portuguese; dictionaries loaded server-side; the existing `useT()` contract is preserved.
4. **Branding** is fetched server-side and injected as CSS variables on `<html>`/`<body>`.
5. **Session across subdomains:** central auth at the apex + a **single-use, short-lived handoff code** redeemed on the tenant host for a **host-only session cookie**. A parent-domain cookie (`Domain=.sonvo.lat`) is **PROHIBITED**.

### Firewalls (explicit)

- No parent-domain session cookie; host-only / `__Host-` cookies only.
- No web JWT/BFF token storage (ADR-0009/0011 stand).
- No wildcard CSP/CORS or wildcard OAuth redirect URIs; passkeys remain apex-only.
- No domain/EF/Identity rewrite; no `GroupDomain` schema in this phase.
- No backend string/mail localisation in this phase.

### Rollout

Strangler migration: the Vite SPA stays the production UI until the Next shell reaches parity and is switched at the edge. New code is additive (`web/apps/app/`, `web/apps/docs/`, `/api/session/handoff*`).

---

## ADR-0066 - Tooling: secrets + Docker sandbox MCP servers and validation-symmetry skill

- **Status:** **ACCEPTED** — user-authorized 2026-10-05.
- **Date:** 2026-10-05
- **Extends:** ADR-0002, ADR-0041, ADR-0063, ADR-0064, ADR-0065.

### Context

The user asked to add (1) a secrets-management MCP (Infisical or 1Password), (2) a
Docker sandbox MCP for testing untrusted commands, and (3) a strict
"Zod + FluentValidation" cross-validation rule in `AGENTS.md`.

### Decision

1. **Secrets:** add the official Infisical MCP (`npx -y @infisical/mcp`) to
   `opencode.json`, configured but **`disabled`** until `INFISICAL_TOKEN` (or
   universal-auth credentials) exists. 1Password was evaluated (needs a service
   account token or the desktop app's local MCP) and is **not** added.
2. **Sandbox:** add `docker-sandbox` (`uvx mcp-server-docker`, ckreiling) —
   manages disposable Docker containers and refuses `--privileged` /
   `--cap-add`. Enabled; Docker is already required by the `github` MCP.
3. **Validation:** add the project-local `validation-symmetry` skill and an
   `AGENTS.md` discipline bullet. The literal "Zod + FluentValidation" rule is
   **not** adopted verbatim: Sonivo is React 19 + Vite (no Next.js) and uses
   neither library, so the skill encodes validation symmetry on the actual stack
   and requires approval before introducing either dependency.

### Firewall

- No secrets in git; `infisical` stays disabled until a token is provided via the
  environment.
- Docker is **not** a perfect sandbox; the sandbox MCP can still affect the host
  through Docker — review containers the model creates and remove them.
- Client-side validation is UX, never a security control.
- Extra MCP servers consume context; keep unused ones `disabled`.

### Consequences

The binding allowlist grows from **34 to 35** project-local skills.
`SKILLS-INVENTORY.md`, `TOOLING-AUDIT.md`, `AGENTS.md`, and the tooling doc record
the additions.

---

## ADR-0065 — Tooling: GitHub MCP server + Git governance (Conventional Commits)

- **Status:** **ACCEPTED** — user-authorized 2026-10-05.
- **Date:** 2026-10-05
- **Extends:** ADR-0002 (tooling allowlist), ADR-0041 (single `.agents/` tree), ADR-0063/0064 (platform skills + MCP servers, security MCP servers).

### Context

The user asked to wire OpenCode to GitHub for rigorous versioning and to enforce
Conventional Commits, using the official GitHub MCP server and the `gh` CLI.

### Decision

1. Add the **official GitHub MCP server** to root `opencode.json` as a **local
   Docker** server (`ghcr.io/github/github-mcp-server`), with toolsets
   `context,repos,pull_requests,actions,git` and the token supplied through the
   environment as `GITHUB_PERSONAL_ACCESS_TOKEN` (never committed).
   - The hosted remote variant (`https://api.githubcopilot.com/mcp/`) was **not**
     used: OpenCode V2 does not interpolate `{env:...}` embedded inside a larger
     header string such as `"Bearer {env:GITHUB_PERSONAL_ACCESS_TOKEN}"`, so the
     remote header arrived malformed. Passing the token as a real environment
     variable to the local server avoids this.
2. Add the project-local `git-governance` skill and a `.githooks/commit-msg`
   Conventional Commits gate (uses `commitlint` when available, POSIX fallback
   otherwise) plus `.commitlintrc.json`; enable once with
   `git config core.hooksPath .githooks`.
3. **Do not** automate `gh pr create`, commit, push, or merge. Git authority
   remains human-gated (`AGENTS.md`); the third-party tutorial's "autonomous PR"
   guidance is deliberately **not** adopted.

### Firewall

- No tokens in git; the PAT comes from the environment.
- The hook must not auto-install `commitlint` or reach the network.
- Git-AI / commit-metadata tooling is **not** installed: it adds AI attribution,
  conflicting with the no-credit commit rule.
- Git authority (explicit authorization for commit/push/PR/merge) is unchanged.

### Consequences

The binding allowlist grows from **33 to 34** project-local skills.
`SKILLS-INVENTORY.md`, `TOOLING-AUDIT.md`, and `AGENTS.md` record the addition and
the commit-message gate.

---

## ADR-0064 — Tooling: OpenCode V2-native MCP config + security MCP servers + security skills

- **Status:** **ACCEPTED** — user-authorized 2026-10-05.
- **Date:** 2026-10-05
- **Extends:** ADR-0002 (tooling allowlist), ADR-0039 (knowledge workflows), ADR-0041 (single `.agents/` tree), ADR-0063 (platform skills + MCP servers).
- **Reference:** [`docs/tooling/OPENCODE-V2-MCP-SKILLS-2026-10.md`](../tooling/OPENCODE-V2-MCP-SKILLS-2026-10.md)

### Context

The root `opencode.json` used the V1 MCP shape (server names directly under `mcp`
with `enabled: true`). OpenCode V2 reads that for compatibility but the native
shape nests servers under `mcp.servers` and uses `disabled` to opt out. The user
also asked to harden the development environment with security-oriented MCP
servers and project-local skills, and explicitly authorized the change.

### Decision

1. Migrate the root `opencode.json` to the **V2-native** `mcp.servers` shape and
   drop the V1 `enabled` flags (servers connect by default).
2. Add two security MCP servers as environment tooling — **not** a
   reproducibility dependency of the app:
   - `semgrep` — local, `uvx --from semgrep semgrep mcp -t stdio`, **enabled** (no token required; verified connected; 120 s startup/catalog timeout).
   - `snyk` — local, `npx -y snyk@latest mcp -t stdio`, **enabled**; authenticate with
     `snyk_auth` (or supply `SNYK_TOKEN` via `{env:SNYK_TOKEN}` — never committed).
     `SNYK_MCP_PROFILE=lite` keeps the tool surface small.
3. Authorize two **project-local** security skills under `.agents/skills/`,
   adapted to Sonivo's stack (not copied from the Next.js-oriented tutorial):
   - `dotnet-secure-architecture` — ASP.NET Core / EF Core / Identity / tenancy hardening.
   - `react-frontend-security` — React 19 / Vite / Tailwind XSS, env-leak, token, client-authz review.

### Firewall

- `snyk` is enabled but unauthenticated until the user signs in (`snyk_auth`); any
  token is supplied via `{env:SNYK_TOKEN}` and never written to git.
- No user-global tooling becomes a Sonivo dependency (`PRESENT ≠ AUTHORIZED`).
- All new skills live in `.agents/skills/`; no parallel vendor trees (ADR-0041).
- Security MCP servers add model context; add only what is needed.
- Further skill/MCP additions still require explicit human authorization.

### Consequences

The binding allowlist grows from **31 to 33** project-local skills.
`SKILLS-INVENTORY.md`, `TOOLING-AUDIT.md`, and `AGENTS.md` record the new set and
the V2 config shape.

---

## ADR-0063 — Tooling: adopt official agent skills (.NET / testing / security) + MCP servers

- **Status:** **ACCEPTED** — user-authorized 2026-10-04.
- **Date:** 2026-10-04
- **Extends:** ADR-0002 (tooling allowlist), ADR-0039 (knowledge workflows), ADR-0041 (single `.agents/` tree).
- **Research:** [`docs/tooling/SKILLS-ECOSYSTEM-RESEARCH-2026-10.md`](../tooling/SKILLS-ECOSYSTEM-RESEARCH-2026-10.md)

### Context

A gap analysis of the project-local skill set against the 2026 Agent Skills ecosystem
(Anthropic, Microsoft .NET team, Matt Pocock, Trail of Bits) found the core discipline
skills strong but the actual product stack (.NET/ASP.NET Core/EF Core/PostgreSQL) and
security review uncovered. The user explicitly authorized extending the allowlist.

### Decision

Authorize these additional **project-local** skills, installed under `.agents/skills/`
from first-party/official sources and audited (frontmatter valid; scripts/references reviewed):

| Skill | Source | Purpose |
| ----- | ------ | ------- |
| `dotnet-webapi` | `dotnet/skills` (Microsoft .NET team) | ASP.NET Core Web API endpoints, OpenAPI, error handling |
| `optimizing-ef-core-queries` | `dotnet/skills` | Diagnose/fix slow EF Core queries |
| `create-datadriven-aspnetcore` | `dotnet/skills` | Data-driven ASP.NET Core code without CLI scaffolding |
| `csharp-refactoring` | `dotnet/skills` | Behavior-preserving C# refactors |
| `skill-creator` | `anthropics/skills` (Anthropic) | Author/improve/measure skills |
| `writing-for-agents` | `mattpocock/skills` | Writing skills / `AGENTS.md` for agents |
| `pr` | `mattpocock/skills` | Pull-request body shape |
| `differential-review` | `trailofbits/skills` | Security-focused review of a diff/PR |
| `creative-frameworks` | user-authored (2026-10-04) | Ideation/copywriting (SCAMPER) |

Also authorized: the root `opencode.json` **MCP servers** (`drawio`, `excalidraw`,
`sequential-thinking`, `fetch`) as environment tooling — **not** skills and **not** a
reproducibility dependency of the app.

### Firewall

- Sources must be **first-party/official** and audited before install; no unaudited
  community bundles.
- **No** wholesale adoption of `obra/superpowers` (telemetry-by-default; subagent-driven
  model conflicts with Sonivo's "no delegation without authorization").
- `skills-lock.json` is managed **only** by the official `skills` CLI — never hand-edited.
- Upstream drift is real: `resolving-merge-conflicts` was removed from `mattpocock/skills`;
  keep the local copy. Bulk-updating the 13 pinned Matt skills requires a separate review.
- Deliberately **not** installed after evaluation: `webapp-testing` (Python-oriented vs the
  TS `e2e/` stack; the Playwright MCP already covers browser automation), `frontend-design`
  (overlaps `impeccable`), MSTest-specific `dotnet-test` skills (Sonivo uses **xUnit**),
  third-party `prompt-engineering` (unaudited). Context7 stays **DEFERRED**.
- Installing further skills/tooling still requires explicit human authorization.

### Consequences

The binding allowlist grows from 22 to 31 project-local skills. `SKILLS-INVENTORY.md` and
`TOOLING-AUDIT.md` record the new set; the ADR index at the bottom of this file is stale
(ends at 0023) and is out of scope for this change.

---

## ADR-0060 — Kanban board: `in_progress` state + clean validation errors

- **Status:** **ACCEPTED** — user-authorized 2026-10-03.
- **Date:** 2026-10-03
- **Amends:** ADR-0056 (Kanban board) — adds `in_progress` state and fixes error messaging.

### Decision
Add `in_progress` as a third valid task status alongside `open` and `done`. The board already has
three columns; the backend must accept all three to avoid rejecting legitimate movements.
Additionally, validation error messages must be clean and translatable — no internal parameter
names like `(Parameter 'status')` should leak to the API response.

### Firewall
- No new backend entity; reuses `GroupTask` with additive status.
- No database CHECK constraint required (domain validation is sufficient).
- Error messages must be i18n-ready strings, not raw .NET exception text.

---

## ADR-0061 — Kanban board: pointer-based drag-and-drop library

- **Status:** **ACCEPTED** — user-authorized 2026-10-03.
- **Date:** 2026-10-03
- **Amends:** ADR-0056 (Kanban board) — replaces native HTML5 drag with a pointer-based library.

### Decision
Replace native HTML5 drag-and-drop (`draggable`, `onDragStart`) with `@dnd-kit` for full control
over the drag visual, touch support, keyboard navigation, and screen-reader announcements.
The library must be lazy-loaded so it does not affect the initial bundle.

### Firewall
- `@dnd-kit` is the only new production dependency for this feature.
- Lazy-load the board component (`React.lazy`) so the library loads only on the tasks page.
- Drag must support: mouse (6px threshold), touch (200ms long-press + vibration), keyboard
  (Space lift, arrows move, Space drop, Esc cancel).
- Must include `DragOverlay`, auto-scroll near edges, and an "Undo" toast after drop.
- Respects `prefers-reduced-motion`.

---

## ADR-0062 — Kanban board: expanded scope (links, manual order, real-time, notifications, templates)

- **Status:** **ACCEPTED** — user-authorized 2026-10-03.
- **Date:** 2026-10-03
- **Amends:** ADR-0056 (Kanban board) — expands the kanban with high-value differentiating features.

### Decision
Expand the kanban board with the following features, in order of value:

1. **Task-to-entity links**: link a task to an Event, Arrangement, or Song ("Learn X for Friday's
   rehearsal"). New `TaskLinks` table.
2. **Manual ordering within a column**: respect the existing `Position` field; fractional ranking
   so moving one card does not rewrite the whole column.
3. **Shared real-time updates**: polling every 30s or SignalR to reflect other users' changes.
4. **Notifications**: on assignment and due-date reminders (aligns with ADR-0039 email phase).
5. **Task templates**: per event type (rehearsal, concert).
6. **"My tasks" view**: cross-group task list on the home page.
7. **Checklist inside a card**: deferred until demand exists; labels and comments are future.

### Firewall
- Links are soft (no hard FK constraints to arbitrary entities — use `EntityType` + `EntityId`).
- Real-time is read-only (no collaborative editing of the same task).
- Notifications are best-effort (same as presence, ADR-0055 W-E).
- No new role hierarchy; same Manager/Owner write, Member read (ADR-0051).
- Each feature ships in its own PR with tests.

---

## ADR-0056 — Kanban board for group tasks

- **Status:** **ACCEPTED** — user-authorized 2026-10-03.
- **Date:** 2026-10-03
- **Amends:** ADR-0055 (W-G tasks) — adds a board view.

### Decision
Add a Kanban board to `/groups/:id/tasks` (Planner-style): columns by status or assignee,
drag-and-drop between columns, alongside the existing list view. Pure client-side projection of the
`GroupTask` entity/endpoints from W-G.

### Firewall
- No new backend entity; the board reuses `GroupTask` PATCH/status endpoints.
- Drag-and-drop mutates `Status`/`AssigneeUserId` only.

---

## ADR-0057 — Live chord viewer: transposer, autoscroll, metronome

- **Status:** **ACCEPTED** — user-authorized 2026-10-03.
- **Date:** 2026-10-03
- **Amends:** ADR-0031 (Practice follow-along) — lifts transpose/autoscroll to a live performance viewer.

### Decision
A live chord/lyrics viewer with real-time transposition (semitone offset), autoscroll (speed control),
a visual/audio metronome with BPM, and a setlist mode. Extends the ADR-0031 Practice surface
(`transposeChordPro`, `stage.scrollPlay`) into a dedicated "Visor Live" for rehearsals/performances.

### Firewall
- No audio engine beyond the existing metronome/click (ADR-0031/0037); multitrack stems are separate.
- Autoscroll is best-effort; never authorizes anything.

---

## ADR-0058 — Members 2.0: instruments, availability, RSVP status, section filters

- **Status:** **ACCEPTED** — user-authorized 2026-10-03.
- **Date:** 2026-10-03
- **Amends:** ADR-0047 (managed accounts) + ADR-0051 (roles) — enriches the member profile.

### Decision
Extend the member profile with: primary/secondary instrument (beyond `MusicalRole` free text),
weekly availability, RSVP status for the next event, and section filters (Músicos/Técnicos/Líderes/
Administradores). Invitations by email with predefined roles (ADR-0047 managed accounts + ADR-0039
Gmail outbound).

### Firewall
- Availability/RSVP are best-effort and never authorize anything (same as presence, ADR-0055 W-E).
- No new role hierarchy; sections are filters over the existing roles.

---

## ADR-0059 — White Label v3: real-time palettes, theme toggle, predefined themes

- **Status:** **ACCEPTED** — user-authorized 2026-10-03.
- **Date:** 2026-10-03
- **Amends:** ADR-0054 (White Label v2) — real-time brand editor.

### Decision
Extend the brand editor with: a color wheel / hex picker with live preview, predefined palettes
(Océano/Atardecer/Bosque/Dark), a light/dark theme toggle with AA contrast preview, and live
banner/group-name editing. Reuses the ADR-0054 `--brand-*` token contract and `GroupBranding` endpoints.

### Firewall
- Brand tokens remain the contract (ADR-0054); no free CSS.
- All presets must keep AA contrast (4.5:1) — server-validated as in ADR-0054.

---

## ADR-0060 — Group typography picker (display fonts)

- **Status:** **ACCEPTED** — user-authorized 2026-10-05 ("lo que consideres, apruebo lo que consideres mejor").
- **Date:** 2026-10-05
- **Amends/supersedes:** the ADR-0054 §Firewall and ADR-0055 §Firewall lines
  "No typography picker / no new fonts" — **only** the typography/picker part.

### Context
A typography picker already existed in `GroupSettingsPage`/`TYPOGRAPHY_OPTIONS`, but the
stored option **id** was applied as the CSS `font-family`, so choosing "Serif" produced
`font-family: serif` (generic Times New Roman). The referenced webfaces were also not
loaded (only Plus Jakarta Sans was), and the chosen face replaced `--font-sans`, turning
the entire workspace — controls included — into the fallback font.

### Decision
- Keep a **typography picker** limited to a curated allowlist of display faces
  (`TYPOGRAPHY_OPTIONS`), loaded from the **existing** Google Fonts provider (same origins
  the CSP already allows; no npm dependency, no new provider).
- The chosen face drives a **`--font-display`** token applied to headings (`h1–h4`) and the
  group brand name only. The UI `--font-sans` is **unchanged**, so controls and body text
  stay legible and a group can never turn the whole workspace into a system serif.
- The stored `GroupBranding.Typography` remains the option **id**; `typographyFamily()`
  resolves id → CSS stack at render. Legacy ids `system`/`serif`/`mono`/`rounded` are kept.

### Firewall
- Display faces come from the curated allowlist only — no free `font-family` input, no
  arbitrary remote fonts; one stylesheet, `display=swap`.
- No new provider/dependency; Google Fonts stays the only external font origin.
- Typography never touches `--font-sans` and never authorizes anything (colours/AA rules
  from ADR-0054/0059 are unchanged).

---

## ADR-0061 — Plans, entitlements and personalization levels

- **Status:** **ACCEPTED** — user-authorized 2026-10-05 ("esto definí" + "autorizo todo ... haz los cambios que tengas que hacer en doc").
- **Date:** 2026-10-05
- **Spec:** [`PHASE-PLANS-SPEC.md`](PHASE-PLANS-SPEC.md).
- **Amends:** ADR-0054/0059 (brand editor) — brand capabilities are now **gated by plan level**.
  Complements ADR-0060 (typography): the picker becomes **Advanced-only** under this gating.

### Decision
- A single **entitlements catalog** is the one source of truth for limits and features per plan
  (Starter/Pro/Studio). No plan numbers anywhere else in the code.
- The **effective brand config** = saved config **filtered by the plan's capabilities**
  (`none` | `basic` | `advanced`). What the plan forbids is ignored at render but **not deleted**.
- Token derivation from a base colour uses **OKLCH**, plus **intensity**, **gradient style**,
  **10 predefined themes**, and a **contrast guard** that adjusts/corrects to AA (4.5:1 text,
  3:1 non-text), validated **in the backend** too.
- The identity editor renders **by level** with locks and an upgrade card; nothing disappears silently.
- Downgrades keep data (`read-only` over-limit content; suspended members; archived groups) and the
  saved brand config; the Sonivo theme applies while the plan excludes it.

### Firewall
- **No payments in this ADR** (see ADR-0063); plan assignment can be manual/placeholder first.
- No new provider/dependency; colours are server-validated hex; no free CSS.
- Limits never block viewing/editing/deleting existing content.

---

## ADR-0062 — Organization (multi-group container)

- **Status:** **ACCEPTED** — user-authorized 2026-10-05.
- **Date:** 2026-10-05
- **Spec:** [`PHASE-PLANS-SPEC.md`](PHASE-PLANS-SPEC.md) §3.3/§6.
- **Amends:** the ADR-0055 firewall "no new IA sections" and the general exclusion of an org
  hierarchy — **only** to introduce the organization container for Studio.

### Decision
- Introduce an **Organization** that owns one or more groups and, in Studio, shares **plan, storage
  and billing**. Starter/Pro keep the group as the only customer; the org exists but holds one group.
- The **group limit** and the **extra-group add-on** validate against the **organization**, not the user.
- Configuration can be copied across the org's groups ("Apply to all groups", placeholder) and then
  diverge per group.

### Firewall
- The organization is a **billing/limit container**, not a new ACL engine: group-scoped server-side
  authorization and Owner/Member roles are unchanged.
- No payments here (ADR-0063); no subdomains/custom domains (ADR-0049 stays blocked).

---

## ADR-0063 — Payments IN (supersedes ADR-0042)

- **Status:** **ACCEPTED** — user-authorized 2026-10-05 ("autorizo todo").
- **Date:** 2026-10-05
- **Supersedes:** **ADR-0042** ("Payments OUT"); lifts its prohibition and the "no billing" firewalls
  (`ADR-0053`/`0055`) **within this phase**.
- **Spec:** [`PHASE-PLANS-SPEC.md`](PHASE-PLANS-SPEC.md) §4.

### Decision
- Billing/payments are **IN scope**: subscriptions, 14-day trials, grace period, proration,
  downgrade scheduling, and the extra-group add-on.
- Provider, CFDI invoicing and tax handling are **placeholder** (§9.13) and must be decided before
  wiring a gateway.
- **Implementation can start without a gateway:** the entitlements catalog + effective-plan filter
  ship first with a manually-assigned plan; the payment provider plugs in later.

### Firewall
- Do **not** reintroduce the removed insecure scaffold (`WebhooksController`, stub `IPaymentGateway`,
  `StripePaymentGateway`/`MercadoPagoPaymentGateway`, `WebhookEventLog`) as-is; a real gateway design
  (signature verification, secrets from config, idempotency) is required first.
- No payment keys/secrets in git; webhooks verify signatures; no anonymous write endpoints.
- Billing never gates viewing/editing/deleting existing content (ADR-0061 stands).

---

## Open decisions needing explicit authorization

- **Subdominio/dominio custom** (`slug.sonivo.lat`): **ADR-0049 blocks it** — needs a superseding ADR.
- **Matriz de permisos granular** (ver cifrados/descargar PDFs, editar repertorio, crear eventos,
  gestionar disponibilidad, acceso white-label): **ADR-0012/0051** fix the role hierarchy and ACL
  engines are prohibited (ADR-0005) — needs a superseding ADR.

---

## ADR-0055 — Group workspace redesign to the reference mockup

- **Status:** **ACCEPTED** — user-authorized 2026-10-02 ("Sí: ADR-0055 + todas las olas W-A…W-H", including new **Tasks** and **presence**).
- **Date:** 2026-10-02
- **Amends:** ADR-0054 — lifts its "no new IA sections" firewall for this redesign. ADR-0048/0054 branding stays.
- **See:** [`PHASE-WORKSPACE-REDESIGN-SPEC.md`](PHASE-WORKSPACE-REDESIGN-SPEC.md).

### Decision

Redesign the group workspace to match the approved reference mockup (grouped sidebar, immersive home hero,
per-section screens) in waves:

- **W-A Shell + home:** sectioned group sidebar (`Organización`: Calendario/Eventos/Tareas · `Equipo`:
  Miembros/Roles/Recursos/Archivos), group identity block, top bar, immersive hero (banner + tagline +
  verse + member avatars + count), quick tiles, next events, recently added songs, promo card.
- **W-B Canciones:** song **Tags** and per-user **favourites**; tabs (Todas/Favoritas/Recientes/Por tema)
  and a dense table.
- **W-C Calendario por grupo** + "Próximos eventos" panel.
- **W-D Recursos/Archivos:** group-level material library (aggregated) + categories + "Subir recurso".
- **W-E Miembros:** role tabs, instrument, **presence** (last-seen).
- **W-F Song detail:** tabs (Letra/Acordes/Notas/Archivos) + Información sidebar + related files.
- **W-G Tareas:** new `Task` entity + API + UI.
- **W-H:** i18n es/en, a11y AA, E2E + Playwright MCP, docs.

New additive domain: `GroupBranding.Tagline` / `GroupBranding.Verse`; `Song.Tags`; `SongFavorite`
(per user); `Task`; `ApplicationUser.LastSeenAt` (presence heartbeat). Resources stay on arrangements;
the group library is an aggregation query, not a new aggregate.

### Firewall (explicit)

- No subdomains/custom domains (ADR-0049 stays blocked); no billing (ADR-0042); no web JWT/BFF.
- No AuthZ/session/cookie change: membership required, non-member → 404; role predicates unchanged.
- ~~No typography picker / new fonts~~ (picker superseded by ADR-0060); no new
  provider/dependency beyond what the waves require.
- Scope is limited to the eight waves above; anything else needs a new decision.

### Addendum — 2026-10-03 (owner-directed IA refinement)

The owner refined the sidebar IA to remove redundant destinations and reduce the
"where do I go?" problem:

- **Música** section: **Canciones** (the structured repertoire screen; the page previously
  titled "Biblioteca") + **Listas**. "Biblioteca" is no longer a separate nav item — Canciones
  already is the group's musical library.
- **Organización:** Calendario · Eventos · Tareas. **Equipo:** Miembros · Roles.
- **Recursos** is a cross-cutting top-level section (the group material library).
- **Archivos** is no longer a top-level section: files are attachments on their
  song/event/resource. `/groups/:id/archivos` redirects to `/groups/:id/recursos`.
- Both sidebars (app shell and group rail) hide their scrollbar while remaining scrollable.

This narrows W-D: the material library lands on `/recursos`; `/archivos` is an alias.

**All waves shipped (2026-10-03):** W-A…W-H merged to `develop` (PRs #186–#192). The phase is CLOSED.

---

## ADR-0054 — White Label v2: full brand tokens, secondary colour and banner

- **Status:** **ACCEPTED** — user-authorized 2026-10-02 ("luz verde total", scope confirmed: refresh over the current group IA, extend ADR-0048, flag ON by default, branch from `develop`).
- **Date:** 2026-10-02
- **Amends:** ADR-0048 (per-group white label). Keeps its tenancy/indexing/auth rules; widens the branding model and token contract.
- **Supersedes:** the `DESIGN.md` "no backend-driven theming" line (out-of-scope list) and the `ajustes.logoNote` "logo coming soon" copy.
- **See:** [`PHASE-WHITELABEL-SPEC.md`](PHASE-WHITELABEL-SPEC.md) §4.3 (updated).

### Context

ADR-0048 shipped `GroupBranding` (accent, cover emoji/gradient, theme default, locale, welcome/login
copy, logo, `ShowSonivoCredit`), the per-group API, the path tenancy (`/g/{slug}`) and the branded access
screen. The backend is live behind `Features:GroupBranding`, but the **frontend never wired the write
path**: `updateGroupBranding` and the logo upload were unused, `GroupSettingsPage` still edited a
**device-local** appearance (`localStorage`), and `ThemeDefault` was never applied. The organizer brief
asks for a real White Label panel (logo, banner, primary/secondary colours, brand accents, dark/light)
applied dynamically without breaking AA contrast.

### Decision

- **Brand tokens are the contract, never free CSS.** A group resolves a bounded token set applied to the
  group shell only (never `:root`, so brands never leak across groups):
  `--brand-primary`, `--brand-on-primary`, `--brand-secondary`, `--brand-on-secondary`, `--brand-accent`.
  `--group-accent` stays as a compatibility alias of `--brand-primary`.
- **Colours stay server-validated hex.** `AccentHex` is the **primary/accent** colour (unchanged field
  name, existing AA-vs-white rule ⇒ `on-primary = #ffffff`). New `SecondaryHex` is optional; the server
  computes `on-secondary` by choosing white or near-black, whichever meets WCAG AA, and **rejects** a
  secondary where neither reaches 4.5:1.
- **Banner image.** New `BannerBlobKey` / `BannerContentType`, uploaded via `IBlobStore` with the same
  allowlist and 2 MiB cap as the logo. Precedence at render: **banner image → cover kind (gradient/emoji)
  → none**. `CoverKind`/`CoverValue` stay (fallback), so the change is additive.
- **Theme default precedence.** `ThemeDefault` (light/dark/system) applies **only until the user makes an
  explicit choice**; an explicit user choice wins and is persisted. Changing groups re-evaluates the
  default when no explicit choice exists.
- **Flag ON by default.** `Features:GroupBranding` defaults to `true`; the off path is preserved for the
  tests/rollback.
- **Editor.** `GroupSettingsPage` gains a real brand editor (primary/secondary/accent, logo + banner
  upload, theme default, welcome/login copy, `ShowSonivoCredit`) with live preview and AA feedback.

### Firewall (explicit)

- **No subdomains / custom domains**: ADR-0049 stays **documentation-only / BLOCKED**.
- ~~**No typography picker and no new font**~~ — **superseded by ADR-0060** (curated group
  display fonts; `--font-sans` still unchanged).
- **No new IA sections**: no Tareas/Roles/Recursos/Archivos top-level nav — only a visual refresh over
  the current Inicio/Biblioteca/Listas/Eventos/Miembros/Ajustes structure.
- **No image re-encode** in v1 (ADR-0048 deferral stands); no new dependency, no new provider.
- Isolation unchanged: membership required, non-member → 404; Owner writes, Manager/Member read
  (`RequireOwnerAsync` for writes).

### Deltas vs current docs (flagged, not silent)

- `DESIGN.md`: token table gains the `--brand-*` group-scoped set; the "no backend-driven theming"
  prohibition is removed.
- `CONTEXT.md`: the white-label line moves from "PROPOSED, not implemented" to the real as-built state.
- `PHASE-WHITELABEL-SPEC.md`: status updated; §4.3 reflects the shipped editor and the v2 additions.

---

## ADR-0053 — Inicio dashboard + app-shell sidebar (home redesign)

- **Status:** **ACCEPTED** — user-authorized 2026-10-02 ("luz verde total … implementación completa respetando las fases, Playwright MCP y Git con `gh` a `develop`").
- **Date:** 2026-10-02
- **Amends:** ADR-0043 (visual direction stands; the information architecture of the signed-in, non-group routes changes).
- **Reconciles / supersedes:** `PHASE-APP-HEADER-SPEC.md` decision **D4** ("AppHeader in the content column; no left rail on `/`") for `/` and the account routes. The state touched by the shipped W1 is reused; W2–W8 are absorbed into this phase where they still apply.
- **See:** [`PHASE-HOME-DASHBOARD-SPEC.md`](PHASE-HOME-DASHBOARD-SPEC.md).

### Decision

- **`/` becomes the Inicio dashboard** (greeting, quick actions, "Tus grupos", "Tu próxima actividad", learning banner). The group list moves to **`/grupos`**. `Unirse a grupo` is a first-class nav route (`/unirse`).
- **Persistent left sidebar** for authenticated, non-group routes, replacing the top-only chrome on `/` and `/cuenta`: Principal (`Inicio`, `Mis grupos`, `Unirse a grupo`), Cuenta (`Perfil`, `Notificaciones`, `Preferencias`), plus `Plan y facturación` and `Ayuda`, and a user card footer. The group workspace rail (`/groups/:id`) is unchanged. Mobile gets a drawer/bottom navigation; the layout is responsive.
- **Top bar** carries the global search field, a notification bell and the user avatar → menu (Cuenta sections, Seguridad, Cerrar sesión).
- **Search** filters the already-loaded groups and navigation actions on the client (no cross-entity backend search in this phase).
- **New authenticated, group-scoped endpoint** `GET /api/activity/upcoming` returns the next events across the caller's groups (group id/name, title, type, `startsAt`), excluding cancelled/hidden events. Never trusts a client group id.
- **Covers** stay emoji/gradient (device or server branding). Real per-group logo/cover upload is **FUTURE**; the card is built so a logo can replace the emoji without a layout change.
- **i18n** es/en for every new string; **a11y** floor (focus-visible, ≥44px targets, `aria-live`, AA contrast) and light/dark parity per ADR-0043.

### Firewall (explicit)

- **No billing/payments** (ADR-0042 stands). `Plan y facturación` and `Uso y límites` are **disabled placeholders** ("Próximamente"); no gateway, no webhook, no plan/usage tables.
- **No in-app notification center** and no bell backend — the bell and `Notificaciones` are **disabled placeholders** (FUTURE).
- **No AuthZ/session/cookie changes**: server-enforced Group scope, Identity cookie + antiforgery (ADR-0009–0012, 0019–0020) stay untouched.
- **No new dependencies**; **no real image cover upload** in this phase.
- No change to the accepted brand mark or the es-default language policy.

### Addendum — 2026-10-02 (Cuenta completa + calendario general)

- **Cuenta (`/cuenta`)**: matches the approved reference — user card with **Editar perfil**, and cards for *Información personal*, *Seguridad*, *Notificaciones*, *Preferencias*, *Plan y facturación* and *Uso y límites*. Only **real** data is shown (name/email, password/2FA status, language, appearance, device time zone, role derived from memberships). **Plan/Uso/Notificaciones/Sesiones activas stay disabled placeholders** (ADR-0042 stands; no payments, no usage metering).
- **Profile edit**: new `PATCH /api/auth/me { displayName }` (cookie + antiforgery) so "Editar perfil" persists the name. Not an AuthZ/session change.
- **Inicio**: the dashboard keeps only `Crear grupo` and `Unirse a grupo`; the top search is **groups-only** ("Buscar grupos") and the learning banner is removed.
- **General calendar**: new authenticated, group-scoped `GET /api/activity/calendar?from&to` (scheduled, non-hidden, range ≤ 62 days) powers `/calendario`, a read-only month view of all the caller's groups, reachable from "Ver calendario". It never creates events.

### Deltas vs current docs (flagged, not silent)

- `PHASE-APP-HEADER-SPEC.md` D4 is superseded for `/` and account routes; its W2–W8 items are re-homed here where still wanted (bandeja de usuario, conmutador de grupo, búsqueda, footer/versión).
- `CONTEXT.md` and `DESIGN.md` route/IA wording updated to match (`/` = Inicio, `/grupos` = Mis grupos).

---

## ADR-0044 — DevSecOps baseline: SAST/SCA gates, CodeQL + Dependabot CI, backend security audit

- **Status:** **ACCEPTED** — explicitly authorized by the user on 2026-09-30 (DevSecOps engagement: audit, secure, and automate backend security).
- **Date:** 2026-09-30
- **See:** [`SECURITY-AUDIT-2026-09.md`](SECURITY-AUDIT-2026-09.md) (audit report, findings, remediation plan); follow-up hardening pass [`SECURITY-AUDIT-2026-10.md`](SECURITY-AUDIT-2026-10.md) (authorized 2026-10-04: residual + new findings, fixes, tests, deployment constraints).

### Decision (proposed)

- **Build-time gates (zero new packages):**
  - `Directory.Build.props`: NuGetAudit in `all` mode (direct + transitive); NU1902/NU1903 escalate to **build errors**.
  - Root `.editorconfig`: surgical, security-only Roslyn ruleset — deterministic dangerous-API rules (CA3061/75/76/77, CA3147, CA5350/51/58, CA5374, CA5390/91/94/98/99, CA5400) at `error`; heuristic taint-review rules (CA3001–CA3006) at `warning` (triaged in review, never ignored). No repo-wide AnalysisLevel change.
- **CI security automation:** `.github/workflows/codeql.yml` (CodeQL C# SAST, PR/push + weekly schedule, SARIF upload) and `.github/workflows/security.yml` (explicit per-project vulnerable-package gate, defense-in-depth over NuGetAudit). Existing `ci.yml` backend job automatically enforces the build-time gates. **Tests already block CI**; with required checks after merge (commands in the audit report §7) merges and Render deploys are gated by the full suite.
- **Dependency updates:** `.github/dependabot.yml` — nuget (all 8 project dirs), npm (`/web/sonivo-web`, `/e2e`), github-actions.
- **Audit delivery:** `docs/03-architecture/SECURITY-AUDIT-2026-09.md` — full two-pass audit (`webappsec-review`: repo gates + OWASP ASVS-lite) with findings (1 Critical / 5 Medium / 4 Low), root causes, risk vectors, and a prioritized remediation plan with complete code.
- **M4 applied with the gates:** EF/ASP.NET servicing train 9.0.9 → 9.0.18 (clears all 8 High advisories on the `System.Security.Cryptography.Xml` transitive chain); verified: build green, 444/444 backend tests vs live PostgreSQL, `dotnet list package --vulnerable` clean.

### Firewall

- **No code-level auth fixes applied in this engagement.** The Critical passkey finding (C1) and Medium findings M1/M2/M3/M5 are **PLAN ONLY** (complete code in the audit report §6) — they require explicit approval + ticketed TDD implementation (the C1 fix additionally requires approving the one new dependency `System.Formats.Cbor`).
- No new skills or user-global tooling (ADR-0002/0039/0041 stand); Security Code Scan and OWASP Dependency-Check rejected as redundant (audit report §8).
- No branch-protection/GitHub-settings changes made — required-checks commands are documented for the owner to run after the workflows land on the default branch.

### Deltas vs current docs (flagged, not silent)

- `docs/03-architecture/SECURITY.md` remains the design spec; SECURITY-AUDIT-2026-09.md is the as-built audit layer above it. SECURITY.md §8 logging remains aspirational → tracked as finding M5.
- `docs/tooling/TOOLING-AUDIT.md` updated with the security-tooling authorization block.

---

## ADR-0052 — Event/RSVP notifications (reopens the PHASE-3.9 mail firewall, thin)

- **Status:** **ACCEPTED** — user-authorized 2026-10-01 (white-label program, phase 4.8).
- **Supersedes/amends:** the PHASE-3.9 firewall that limited mail to verification/reset; **reopens** it for group notifications.
- **See:** [`PHASE-WHITELABEL-SPEC.md`](PHASE-WHITELABEL-SPEC.md) §4.8.

### Decision

- Event and RSVP notifications are sent through the **existing Gmail API HTTPS sender**
  (`IEmailSender`); no generic SMTP server, no new provider.
- **Flag-gated:** `Features:Notifications` (default **off**). When off, nothing is sent and the ICS
  endpoint returns 404 — behavior is identical to today.
- **Best-effort:** a transport gap or missing mailbox never fails the domain request.
- **Recipients:** members with a real email. Managed/placeholder addresses (`@managed.invalid`) are
  skipped; **members without an email get the in-app surface** (group events) plus the **per-group ICS
  feed** (`GET /api/groups/{gid}/calendar.ics`, authenticated, read-only).
- Notifications cover: event created / updated / cancelled, and RSVP confirmation to the responder.
  No marketing mail, no digests, no scheduling/bulk mail.

### Firewall (explicit)

- Still **no** Event/RSVP mail outside this flag; no generic SMTP; no third-party provider.
- Only the three event lifecycle messages + RSVP confirmation are in scope.
- The ICS feed is read-only and reveals nothing beyond what an authenticated member can already read;
  a non-member gets 404.

---

## ADR-0051 — Group roles: Owner | Manager | Member | Viewer + musical role

- **Status:** **ACCEPTED** — user-authorized 2026-10-01 (white-label program, phase 4.4). Supersedes the `Owner|Member`-only role list of ADR-0012.
- **Date:** 2026-10-01
- **See:** [`PHASE-WHITELABEL-SPEC.md`](PHASE-WHITELABEL-SPEC.md) §4.4/§5.

### Decision

`Membership.Role` gains two roles, and a descriptive musical role lives on the same row:

| Role | View | RSVP / practice | Manage content (repertoire, setlists, events) | Membership, settings, branding, transfer, delete |
| --- | --- | --- | --- | --- |
| Owner | Y | Y | Y | Y |
| Manager | Y | Y | Y | N |
| Member | Y | Y | N | N |
| Viewer | Y | N | N | N |

- No generic ACL engine, no permission tables (ADR-0012's prohibition stands). Section checks are role predicates in `GroupAccessService` (`RequireOwnerAsync`, `RequireManagerAsync`, `RequireParticipantAsync`).
- **Authorization stays server-side**; the client role chip only hides affordances.
- The **musical role** is free text (≤64, trimmed) and never authorizes anything.
- **Per-group audit log:** `GroupAuditLog` stores ids + a short non-personal `Metadata` (e.g. the new role), never user content. Owner-only read.
- DB `CK_Memberships_Role` widens to the four values (additive/widening migration `AddGroupRolesAndAudit`).

### Consequences

- Content handlers move from `RequireOwnerAsync` to `RequireManagerAsync`; RSVP/practice move to `RequireParticipantAsync`. The conductor room is Manager-capable; a Viewer cannot join it.
- Last-Owner protection is preserved (cannot demote or remove the only Owner).
- Supersedes the "The MVP roles are exactly Owner and Member / do not create an Organizer role" part of ADR-0012.

---

## ADR-0050 — `.lrc` as an import/export format

- **Status:** **ACCEPTED** — user-authorized 2026-10-01 (white-label program, phase 4.2).
- **See:** [`PHASE-WHITELABEL-SPEC.md`](PHASE-WHITELABEL-SPEC.md) §4.

### Decision

- `.lrc` is **not a stored format**: it is parsed into ChordPro + ADR-0031 line marks and exported back.
  No `Arrangement.LyricsFormat` column.
- Encoding: UTF-8 (with/without BOM) and **UTF-16 BOM detection**; **Windows-1252 fallback only with an
  explicit warning**; otherwise reject with a clear message.
- Enhanced (word-level) LRC is **lossy by design** in v1 (line marks only).

---

## ADR-0049 — Public hosts and custom domains — documentation only (BLOCKED)

- **Status:** **ACCEPTED** — user-authorized 2026-10-01 (phases 4.6/4.7). **Nothing is built.**
- **See:** [`PHASE-WHITELABEL-SPEC.md`](PHASE-WHITELABEL-SPEC.md) §4; [`DOMAIN-CHANGE-RUNBOOK.md`](DOMAIN-CHANGE-RUNBOOK.md).

### Decision

1. Branding **in-app, single origin** is what ships (ADR-0048).
2. Subdomain for branded/public surfaces with **central auth + one-time code** (never a parent-domain cookie).
3. Custom domain last: Host resolution + **host-only cookie** + TXT/CNAME ownership verification + per-domain TLS.
4. **Passkeys:** `Passkeys:RelyingPartyId` stays empty ⇒ rpId = current host; managed accounts never rely on passkeys.
5. **Invitations:** the DB stores **only the token**; the URL is built at send time from `PublicOrigin`.
- **Why blocked:** `onrender.com` is a public suffix, so white-label subdomains/domains need a verified custom domain (D2). **No `GroupDomain` table is created meanwhile.**

---

## ADR-0048 — Per-group white label (same origin, by path)

- **Status:** **ACCEPTED** — user-authorized 2026-10-01 (white-label program, phase 4.3).
- **See:** [`PHASE-WHITELABEL-SPEC.md`](PHASE-WHITELABEL-SPEC.md) §4/§5.

### Decision

- `GroupBranding` keyed by `GroupId` (name, logo, accent, cover, theme, locale, welcome/login copy,
  `ShowSonivoCredit`); **strict hex-only colours** with **server-side AA contrast**; sanitised text;
  logo via `IBlobStore` (allowlist + size cap; **image re-encode deferred**).
- Tenancy by path: `Group.Slug` + `GroupSlugHistory`, served at **`/g/{slug}`** on the **same origin**;
  the slug is changeable **once** (`SlugConfirmedAt`), the previous slug permanently redirects and is never reused.
- The **product name** comes from `Brand:ProductName`; no host is written into code or copy (all absolute
  URLs use `PublicOrigin`). **Technical identifiers are not renamed** (`sonivo.auth`, `sonivo.csrf`,
  `sonivo:*` localStorage keys).

---

## ADR-0047 — First-access credentials and pre-hijacking defences

- **Status:** **ACCEPTED** — user-authorized 2026-10-01 (white-label program, phase 4.1).
- **Supersedes:** the "email required for access" part of ADR-0038.

### Decision

- With email → **activation link only** (single-use, expiring); the Owner **never sees a password**.
- Without email → **temporary password** (random, single-use, expiring, shown once, never logged) + a
  server-enforced `MustChangePassword` that blocks the whole API except `me`/`logout`/`change-password`/`csrf`.
- **No automatic linking** of accounts whose email is **unverified** to Google/external providers; before
  linking, **revoke existing credentials** (passkeys + security stamp) and audit.
- Permanent notice in the account UI: **"cuenta administrada por el grupo X"**.
- Handle login `handle@slug` with `Handle` stored **separately** from `GroupId`; uniform responses/timings;
  rate limit per `(slug, IP)`; Identity lockout. `AccountAudit` stores **ids only**.

---

## ADR-0046 — Roster + optional managed account (hybrid)

- **Status:** **ACCEPTED** — user-authorized 2026-10-01 (white-label program, phase 4.1).

### Decision

- `Membership` absorbs the person (one entity); **`UserId` becomes nullable**; an Identity account is
  created **only when the Owner grants access**, tracked by `ApplicationUser.ManagedByGroupId`.
- `Membership.DisplayName` required for roster-only rows; `Membership.Handle` stored separately from `GroupId`.
- Invariants: `CHECK (Role = 'Owner' ⇒ UserId IS NOT NULL)`; filtered unique `(UserId, GroupId)` and
  `(GroupId, Handle)`; **a row with `UserId IS NULL` is a person, never an authenticated member**.
- The `ManagedByGroupId` mark is cleared when the person joins another group, links an external login,
  registers a passkey, or resets via a verified email.

---

## ADR-0045 — Tenancy: Group as tenant with branding; Organization deferred

- **Status:** **ACCEPTED** — user-authorized 2026-10-01 (white-label program, phase 4.0/4.3).
- **Supersedes:** the "no Organization ever" framing of ADR-0005 (Organization becomes FUTURE, not forbidden).

### Decision

- Keep **Group as tenant**; brand/slug tables are keyed by `GroupId` so they can be **re-keyed to an
  `Organization` later** without a rewrite. Organization > Group is deferred (cost in AuthZ + "my groups",
  no proven demand).
- A new abstraction **`ITenantResolver`** ships as **`PathTenantResolver`**; a `HostTenantResolver` can be
  added later **without changing the data model**.
- AuthZ is untouched: membership required, non-member → 404.

---

## ADR-0043 — Total visual redesign: immersive × precise, Grupo/Cuenta IA, frontend es/en

- **Status:** **ACCEPTED** — owner-authorized 2026-09-29 ("Acepto todo"); waves W0–W5 shipped 2026-09-30 (PRs #115–#120, see [`PHASE-UI-UX-SPEC.md`](PHASE-UI-UX-SPEC.md)).
- **Date:** 2026-09-29

### Decision (proposed)

- Replace the current dark-shell visual world with a **total redesign** fusing two references: **Apple Music–like immersion** (artwork-grade group headers, ambient accent washes, large display type) with **Supabase-like precision** (dense tables, disciplined forms, clear empty states) for Operate surfaces.
- **SonivoMark retained** as the brand anchor: 4-bar waveform SVG (`web/sonivo-web/src/brand/SonivoMark.tsx`), currentColor so it inherits the active accent; `BrandLockup` + `WaveformHero` gradient (`#8366F1` → `#E8C4F6`) carry over.
- **Light/dark day-1:** both themes ship with the redesign (no dark-only interim). Current `index.css` is dark-only (`--color-canvas: #0b1220`, white-on-dark body) — W1 must introduce light surface tokens and a persisted theme switcher.
- **IA split** (replaces single group-nav + account drawer in `GroupWorkspace.tsx`):
  - **Grupo** (`/groups/:id`): Listas · Setlists · Eventos · Personas · Ajustes grupo (incl. optional per-group accent / cover / logo onboarding, **Owner-only** mutate, Member read).
  - **Cuenta** (`/cuenta`): perfil · preferencias + idioma · seguridad · mis grupos.
- **Frontend-only es/en i18n (phase 1):** `es` default, persisted switcher in `/cuenta` preferencias. Backend strings, validation messages, and mails stay as-is (**phase 2**, separate ADR).
- **Strangler waves W0–W5:** W0 foundations (this ADR + PRODUCT.md + DESIGN.md + tokens/theme + i18n scaffold) → W1 shell IA split (Grupo vs Cuenta) → W2 Listas → W3 Practice progresivo → W4 Scheduling → W5 i18n-100 + a11y/polish + E2E + cleanup. Each wave ships behind existing routes; no big-bang rewrite.
- **E2E gates:** each wave extends Playwright critical journeys (real React → API → Identity cookie → PostgreSQL); existing TC-LIB/TC-EVT/TC-RSVP/TC-PPL/TC-INV suites must stay green.

### Firewall

- No karaoke-style scoring (ADR-0037 OUT stands).
- No native app; Q11 stays FUTURE — responsive web now, native later.
- No backend i18n now (no API/message/mail string changes).
- No S3/blob, 5 MiB upload cap, or payments/billing changes (ADR-0035, ADR-0042 stand).
- No AuthZ/auth/session changes: Owner/Member, server-enforced Group scope, Identity cookie + antiforgery (ADR-0009–0012, 0019–0020).
- **ACCEPTED 2026-09-29**; implemented as waves **W0–W5** with each wave merged only on green CI. Owner also authorized keeping the parallel structural hardening (route code-splitting, error boundary, `/login?next=` return handling) integrated in W5.

### Deltas vs current docs (flagged, not silent)

- CONTEXT.md ASSUMPTION "English-first UI" → superseded by **es-default es/en**; CONTEXT updated 2026-09-30.
- `docs/01-product/PRODUCT.md` "Visual direction: Not finalized" → direction now defined by root `DESIGN.md`; that line updated 2026-09-30.

---

## ADR-0042 — Payments OUT — revert of unaccepted billing scaffold

- **Status:** **ACCEPTED** — explicitly authorized by the user on 2026-09-28.
- **Date:** 2026-09-28

### Rationale

- No ADR ever authorized payment/billing code; it contradicts PRODUCT.md exclusions and the TECHNICAL-SPEC "Q10 billing Deferred; no payment code" position.
- The scaffold was dead and insecure: `IPaymentGateway` registered but never injected; `StripePaymentGateway`/`MercadoPagoPaymentGateway` were stub/mock; `WebhooksController` (public anonymous Stripe + MercadoPago actions) only wrote `WebhookEventLog` rows with stub-secret fallback, missing-signature bypass, and no MercadoPago signature at all; only one table existed (`WebhookEventLogs`); zero payment keys in render.yaml/appsettings; UI `/settings/billing` was mock pricing cards with no API wiring.

### Scope

- Removed `WebhooksController`, `PaymentGateways` + `IPaymentGateway` (dirs + DI line), `WebhookEventLog` (entity + `DbSet`) with a `RemovePaymentWebhookLog` migration dropping the table, the `/settings/billing` route + nav tab + `SettingsBillingPage` mock cards, and adjusted payment/webhook test references.

### Firewall (restated)

- Payments/billing remain OUT. Any future billing work requires a new explicit human decision and ADR; do not reintroduce Stripe/MercadoPago/webhook/payment scaffolding without one.

---

## ADR-0041 — Single project-local agent customization tree

- **Status:** **ACCEPTED** — explicitly authorized by the user on 2026-09-28.
- **Date:** 2026-09-28
- **Depends on:** ADR-0002 (tooling policy) and ADR-0039 (project-local Obsidian workflows).
- **Supersedes:** ADR-0040 (cross-client skill adapters).

### Consolidation decision

- Keep root `AGENTS.md` as the shared, concise project instruction file.
- Keep all reusable project skills in `.agents/skills/<name>/SKILL.md`; this is the only project-local skills directory.
- Do not create `.claude/skills/` mirrors or `.cursor/` / `.codex/` customization trees. Skills use Agent Skills metadata (`name`, `description`); `globs` belong only to client-specific file rules, which are not part of this setup.
- Keep durable project knowledge in `docs/`, indexed at `docs/00-context/INDEX.md`; keep active task state in `.scratch/NOW.md`.
- Accept that removing Cursor/Codex-specific hooks and agents disables those automations. Do not recreate them under vendor directories or as inert copies under `.agents/`.

### Consolidation consequences

- Project agent instructions and skills have one maintained home; current clients that support `AGENTS.md` and Agent Skills can consume that shared structure.
- Vendor-specific hook automation and four Cursor-only Impeccable subagents are no longer installed in this repository.
- `.github/` remains for CI and PR templates, not agent instruction mirrors.

### Directory scope

User-global configuration · vendor-specific hook recreation · duplicate skill bodies · moving product truth out of `docs/`.

---

## ADR-0040 — Cross-client agent instructions and skill adapters

- **Status:** **SUPERSEDED** by ADR-0041 on 2026-09-28.
- **Date:** 2026-09-28
- **Depends on:** ADR-0002 (tooling policy) and ADR-0039 (project-local knowledge workflows).
- **Extends:** ADR-0039 with Claude Code skill discovery and explicit cross-client precedence.

### Decision

- Keep root `AGENTS.md` as the sole canonical global instruction file. Do not add duplicate `CLAUDE.md` or `.github/copilot-instructions.md`; current Cursor, Codex, and Claude Code can read `AGENTS.md` directly.
- Keep `.agents/skills/<name>/SKILL.md` as the canonical source for the 22 project skills.
- Add `.claude/skills/<name>/SKILL.md` adapters containing standard skill metadata and a relative link to the `.agents/` source; do not copy procedure bodies. Name the code-review adapter `sonivo-code-review` to preserve Claude Code's bundled `/code-review` command.
- Use Agent Skills metadata (`name`, `description`, and only required invocation controls). Do not add `globs` to skills. File-scoped rules use each client's native rule format only when a real scoped need exists.
- Root `AGENTS.md` takes precedence over conflicting skill instructions. Delegation, tracker publication, tooling installation, and Git actions require the corresponding explicit authorization.
- Keep `.cursor/agents`, `.cursor/hooks.json`, `.cursor/skills/impeccable`, and `.codex/hooks.json` as client-specific adapters while active references depend on them. This ADR does not authorize deleting those integrations.

### Consequences

- Global rules have one source; skills have one procedure source with thin Claude discovery adapters.
- Vendor-specific hook formats remain separate because their lifecycle events and schemas differ.
- `.cursor/rules/sonivo-scratch.mdc` was removed after its guidance was migrated to root `AGENTS.md`; Cursor supports `AGENTS.md` as the project instruction source.

### Explicit non-goals

Removing Cursor/Codex hooks or Impeccable assets · adding product rules to `.github/` · user-global configuration · new dependencies · installing other skills.

---

## ADR-0039 — Project-local Obsidian knowledge workflows

- **Status:** **ACCEPTED** — explicitly authorized by the user on 2026-09-28.
- **Date:** 2026-09-28
- **Depends on:** ADR-0002 (project-local tooling policy).
- **Extends:** ADR-0002 with the eight project-local knowledge workflows below; all other tooling authorization rules remain unchanged.

### Tooling decision

Install and adapt the supplied Obsidian memory workflows under `.agents/skills/` so they are discoverable by Sonivo's existing agent setup:

`knowledge-architecture` · `knowledge-retrieval` · `memory-writeback` · `knowledge-maintenance` · `context-optimization` · `project-documentation` · `decision-record` · `session-handoff`

Use the existing `docs/` hierarchy as the sole durable project knowledge base, `.scratch/NOW.md` as the single tracked current-work/checkpoint note, and `docs/00-context/INDEX.md` as the Obsidian navigation page. Do not create a parallel `knowledge/` tree or depend on OpenCode-specific paths. Keep `.obsidian/` configuration local and unchanged. These Markdown skills are project-local and are not external packages or entries in `skills-lock.json`.

### Operational consequences

- Knowledge workflows become reusable without changing product or runtime behavior.
- Existing docs, accepted ADRs, source code, and tests remain authoritative; the index provides navigation only.
- Future skill/tooling additions still require explicit authorization.

### Cross-client exclusions

Changing accepted product or architecture scope · user-global tool installation · modifying `.obsidian/` settings · adding dependencies · maintaining a parallel copy of the supplied `knowledge/` scaffold.

---

## ADR-0038 — Auth hardening: mandatory email verification + TOTP 2FA + passkeys (thin, waves)

- **Status:** **ACCEPTED** — **HUMAN-DELEGATED 2026-09-21** (Kevin: “toma las mejores decisiones para el proyecto y continua”; auditor resolutions below)
- **Date:** 2026-09-21
- **Depends on:** ADR-0009 (Identity AuthN), ADR-0011 (cookie session), ADR-0019 (tenancy/AuthZ), ADR-0020 (CSRF), ADR-0026 (Google external login, verified-email linking); Phase 3.9 Gmail API HTTPS sender (verification-mail transport)
- **Revises:** baseline `RequireConfirmedEmail=false` + ungated login → S1 enforcement per Resolution; login-gate UX; HSTS + rate-limit posture per Resolution. ADR-0026 Google verified-linking unchanged.
- **Does not authorize (firewall):** S2 TOTP or S3 passkeys implementation in the S1 slice (separate waves after S1 ships); generic SMTP transport; Event/RSVP mail; JWT/BFF; account-deletion product; absolute session cap (deferred, see Resolution); changing the register-409 contract (kept, see Resolution)

### Baseline (verified FACTS — current `develop`, read-only grounding, NOT changed by this ADR)

Password policy: min 8 chars with upper + lower + digit required, non-alphanumeric NOT required (`DependencyInjection.cs` Identity options). Lockout: 5 failed attempts / 15 min, enabled for new users. `SignIn.RequireConfirmedEmail = false`. NO confirm / resend / forgot / reset / 2FA / passkey endpoints exist (auth surface = register, login, me, logout + Google). Google: auto-link of an existing password account only when Google asserts `email_verified`; verified Google email sets `EmailConfirmed = true` (ADR-0026); Google-only users may have no usable password (lockout/reset UX for them is out of thin per ADR-0026). Login: unknown email and wrong password share one identical 401 shape (no enumeration); locked-out accounts return their own 401 shape. Register returns 409 on duplicate email/username (known enumeration tradeoff — documented decision needed as part of S1). Cookie `sonivo.auth`: HttpOnly, Secure non-dev, Lax, sliding 14 days, NO absolute cap. Antiforgery double-submit `X-CSRF-TOKEN` (cookie `sonivo.csrf` readable by JS). No HSTS header. OpenAPI mapped dev-only.

### Proposal (ACCEPTED — S1 mechanics decided below; S2/S3 proposals stay open until their waves)

**Wave S1 — mandatory email verification (+ quick wins).**

1. Gate unverified password accounts out of sessions (`RequireConfirmedEmail = true` or equivalent login gate — exact mechanism at ACCEPTANCE).
2. New rate-limited endpoints (sketches; exact routes/shapes at ACCEPTANCE): confirm (token), resend (rate-limited), forgot/reset flow (token, single-use, expiry).
3. Login UX for unconfirmed accounts: deny the session while preserving the same-401-shape discipline (no new oracle — exact status/body at ACCEPTANCE, must not regress the no-enumeration posture), plus a resend path (“¿No recibiste el correo? Reenviar”).
4. Mail transport (proposed): reuse the ACCEPTED Phase 3.9 Gmail API HTTPS sender. NO generic SMTP server, NO Event/RSVP mail. Any other transport needs its own decision.
5. Grandfather rule for pre-existing password users: **DECIDED (b) forced-verify-on-next-login** — no grace state, no banner machinery; denied login returns the Spanish unconfirmed copy + resend affordance; Google-verified accounts exempt per §6. **Live sessions are never invalidated by S1**: `RequireConfirmedEmail` gates sign-in only, and the SPA `RequireAuth` gate checks session presence only (never `emailConfirmed`) — an already-logged-in user keeps working until the cookie expires; enforcement bites at the next login. Documented explicitly so this continuity is contract, not accident.
6. Google `email_verified` accounts stay exempt (already confirmed at the provider per ADR-0026); non-verified Google link behavior unchanged.
7. Quick wins in S1 (decided): HSTS header in non-dev; rate limiting (fixed-window) on register + confirm/resend/forgot/reset endpoints (modest budgets at implementation); absolute session cap **DEFERRED** — sliding 14d stays, proportionate for an org app, revisit on incident. Register-409 contract **KEPT** (existing clients + E2E rely on it; accepted low-risk tradeoff for a group app, documented here instead of drifted).
8. Spanish UI examples (proposed; exact copy at ACCEPTANCE): “Confirma tu correo”, “Te enviamos un enlace de confirmación”, “Reenviar correo”, “Tu cuenta aún no está verificada — revisa tu bandeja o reenvía el correo”, “Restablecer contraseña”, “Enlace expirado o inválido — solicita uno nuevo”.
9. Tests (S1): unit (token generation/validation, resend throttling) + API matrix (verified / unverified / expired-token / rate-limited) + Playwright denial paths (unverified login blocked with resend affordance; confirm happy path; expired-token error).

**Wave S2 — TOTP 2FA via Identity built-in authenticator (proposed).**

1. Enable-start (QR URI + manual key) → verify → enabled; disable requires password recheck; recovery codes one-time, shown once, hashed at rest (exact storage at ACCEPTANCE).
2. Login second step via `RequiresTwoFactor` (exact endpoint shapes at ACCEPTANCE); recovery-code path when the authenticator is unavailable.
3. Google-only users (no password) enrollment: **DECIDED (b) explicit accept, no reauth** — enrollment allowed without a password challenge when the account has no password hash (documented risk; applies at S2).
4. Spanish UI examples (proposed; exact copy at ACCEPTANCE): “Verificación en dos pasos”, “Escanea este código con tu app de autenticación”, “Ingresa el código de 6 dígitos”, “Códigos de recuperación — guárdalos en un lugar seguro”.
5. Tests (S2): unit (TOTP verify/drift window, recovery-code single-use) + API matrix (2FA-enabled login requires second step; wrong code denied; recovery code consumes once) + Playwright denial paths.

**Wave S3 — passkeys (proposed).**

1. **Binding implementer obligation:** at implementation time the implementer MUST verify the exact ASP.NET Core Identity passkey API surface for .NET 9 in Microsoft Learn (names, packages, ceremonies) and record the verified surface in the wave ticket before writing code — this ADR proposes no API names because the surface is version-sensitive.
2. RP ID per-env config (exact keys at ACCEPTANCE; never in git).
3. Password + TOTP stay as fallback; passkey is an additional method, never the sole recovery path. **DECIDED: RP ID explicit per-env config (`Passkeys:RelyingPartyId`, never hardcoded); lost-all-methods = manual support, documented, no code** (applies at S3).
4. Spanish UI examples (proposed; exact copy at ACCEPTANCE): “Iniciar sesión con llave de acceso”, “Crear llave de acceso para este dispositivo”, “Esta llave solo funciona en este sitio”.
5. Tests (S3): unit (registration/authentication ceremony validation with fakes) + API matrix (fallback intact when passkey absent) + Playwright denial paths (ceremony failure keeps the session unauthenticated).

### Open questions (blocking — Kevin decides; auditors do NOT commit unilaterally)

| ID         | Question                                                                                                                                        | Options (NOT decisions)                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S38-Q1** | Grandfather rule: how do pre-existing password users (registered while verification was optional) reach the mandatory-verification world?       | (a) grace-period banner (N days to verify, then blocked) · (b) forced-verify-on-next-login (login denied until confirmed, resend offered) · (c) exempt-existing (only new registrations must verify)  |
| **S38-Q2** | Google-only users (no password) enrolling in TOTP 2FA: what gates enrollment?                                                                   | (a) recent-OAuth-reauth required before enable · (b) explicit accept with no reauth (documented risk)                                                                                                 |
| **S38-Q3** | Passkey RP IDs per environment + recovery UX when ALL methods are lost (password + TOTP + passkey + recovery codes): what is the recovery path? | RP ID values per env (local / Render / custom domain) open; recovery: support-assisted flow (shape open) vs self-serve fallback (shape open) vs no-recovery / account unrecoverable (explicit accept) |
| **S38-Q4** | Enforcement order                                                                                                                               | **DECIDED (a) sequential S1 → S2 → S3** (each wave ACCEPTED + shipped before the next starts)                                                                                                         |

### Resolution (2026-09-21, HUMAN-DELEGATED — auditor decisions, rationale in PR)

S38-Q1 → (b); S38-Q2 → (b); S38-Q3 → config RP ID + manual support; S38-Q4 → (a) sequential. Quick wins: HSTS + rate limits in S1; absolute cap deferred; register-409 kept. Transport: Gmail API reuse, best-effort + warning (T-3.9 pattern). E2E determinism: API white-box token for the confirm happy path; E2E covers denial + resend-accepted + copy. S2/S3 proposals stay open until their waves; their recorded answers above bind those waves unless a later ADR says otherwise.

### Tickets (waves shipped; recorded for history)

| ID          | Sketch                                                                                     | Gates                                            |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **T-AU-00** | Docs: ADR-0038 PROPOSED + PHASE-AUTH-SPEC skeleton + NOW update                            | MERGED (PR #96)                                  |
| **T-AU-01** | S1 implementation: verification endpoints + login gate + quick wins + tests                | MERGED (PR #97)                                  |
| **T-AU-02** | S2 implementation: TOTP enroll/verify/disable + recovery codes + second-step login + tests | MERGED (PR #98)                                  |
| **T-AU-03** | S3 implementation: passkeys (verified .NET 9 surface) + RP ID config + fallback + tests    | MERGED (passkeys E2E + CI fix)                   |

### Consequences (if ACCEPTED as proposed)

- Unverified password accounts stop being session-capable; every new account proves mailbox control before first use (modulo the S38-Q1 grandfather answer).
- Second-factor and phishing-resistant options arrive incrementally without changing the cookie + CSRF posture (ADR-0011/0020 unchanged).
- Each wave ships only after its gating questions are resolved — partial ACCEPTANCE is possible (e.g. S1 while S3 stays PROPOSED).

### Non-goals

Auth behavior changes in the docs PR · generic SMTP · Event/RSVP mail · JWT/BFF · account deletion · multi-provider unlink UI · mobile bearer · weakening the identical-401 discipline (S1 must preserve it) · blob changes · Whisper · cloud LLM · Q9 · pitch · YouTube · MusicXML · scoring

---

## ADR-0037 — Practice extras scope: pitch tuner IN, YouTube reference CONDITIONAL, karaoke scoring OUT

- **Status:** **ACCEPTED** — **HUMAN-DELEGATED 2026-09-21** (Kevin: "acepto todo lo que propongas"; auditor resolves FX-Q1–Q3 per the proposal — tuner IN, YouTube CONDITIONAL IN, scoring OUT-confirmed)
- **Date:** 2026-09-20
- **Accepted:** 2026-09-21
- **Depends on:** ADR-0024 (Resource purposes incl. `reference`), ADR-0027, 0028, 0029, 0030, 0031; T-3.2.06 file/link Resources
- **Revises:** nothing yet — on ACCEPTANCE it would scope three Practice-adjacent extras: (1) authorize a client-only tuner, (2) conditionally authorize a YouTube reference embed, (3) record karaoke scoring as OUT for now
- **Does not authorize (firewall):** Whisper / cloud STT, cloud LLM, realtime multi-device sync (Q9), S3 blob adapter, raising the 5 MiB blob cap, MusicXML / Guitar Pro, Event/RSVP mail, per-note feedback against a reference melody (no reference melody exists), IFrame API control of YouTube, YouTube search/extraction, server-side pitch detection, audio recording

### Context

Practice is usable (player, ChordPro, follow-along per ADR-0027–0031) but three adjacent asks recur: (1) “am I in tune?” before rehearsing, (2) watching the linked reference performance without leaving Sonivo, (3) karaoke-style scoring of a sung take. Each has a different cost/confusion profile. This ADR scopes all three explicitly so implementation tickets can proceed only on what Kevin confirms.

### Proposal (ACCEPTED 2026-09-21, HUMAN-DELEGATED — FX-Q1–Q3 resolved below)

1. **(1) Pitch tuner — IN (proposed): client-only chromatic tuner.** YIN/autocorrelation pitch detection in the web client (AudioWorklet), mic-gated (only while the tuner is open), Spanish “Afinador” UX. No new dependencies, no server, no recording, no persistence. **Non-goal: per-note feedback** — no reference melody exists in Sonivo, so “you sang verse 2 flat” would mislead; the tuner reports the heard pitch only.
2. **(2) YouTube reference embed — CONDITIONAL IN (proposed): `youtube-nocookie` iframe for `purpose=reference` links.** No Data API, no keys. Requires CSP `frame-src` + `img-src` additions for the nocookie host/thumbnails. **Explicit constraint: NO follow-along sync on YouTube** — cross-origin iframe exposes no `timeupdate`; sync stays file-audio-only per ADR-0031. **Non-goals:** IFrame API control, search, extraction.
3. **(3) Karaoke scoring — OUT for now (proposed):** reference-free scores mislead without melody ground truth; game value < confusion risk. May reopen with reference tracks via a future ADR.
4. **Spanish UI** (“Afinador”, reference “Ver referencia”, tuner mic-gate notice — exact copy at ACCEPTANCE).
5. **Tickets (gated on ACCEPTANCE + Kevin in/out confirmation):** T-FX-00 (this proposal docs); ticket sketches TC-PITCH-01 (tuner), TC-YT-01 (reference embed), TC-KAR-01 (scoring — name reserved, OUT) — see [`PHASE-EXTRAS-SPEC.md`](PHASE-EXTRAS-SPEC.md). No implementation branch authorized until Kevin ACCEPTS and confirms in/out.

### Resolution (ACCEPTED 2026-09-21, HUMAN-DELEGATED — auditor decisions, zero spend scope)

| ID        | Decision                                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FX-Q1** | **Tuner IN**: ship the client-only “Afinador” as proposed (no deps, no server, no recording, no persistence). T-FX-01.                                                                                                                                  |
| **FX-Q2** | **YouTube embed CONDITIONAL IN**: allow `youtube-nocookie` iframe for `purpose=reference` links + minimal CSP additions (`frame-src https://www.youtube-nocookie.com`, `img-src https://i.ytimg.com`), with the no-sync-on-YouTube constraint. T-FX-02. |
| **FX-Q3** | **Scoring stays OUT (confirmed)**: karaoke scoring remains OUT for now; reopen only with reference tracks via a future ADR. **Zero implementation work** — TC-KAR-01 name stays reserved.                                                               |

### Open questions (resolved — see Resolution above; kept for reference)

| ID        | Question                                                                                                                                             | Answer                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **FX-Q1** | Tuner in/out confirm: ship the client-only “Afinador” as proposed (no deps, no server)?                                                              | **IN** (T-FX-01).              |
| **FX-Q2** | YouTube embed in/out confirm: allow `youtube-nocookie` iframe for `purpose=reference` links + CSP additions, with the no-sync-on-YouTube constraint? | **CONDITIONAL IN** (T-FX-02).  |
| **FX-Q3** | Scoring stays OUT: confirm karaoke scoring remains OUT for now (reopen only with reference tracks)?                                                  | **OUT confirmed — zero work.** |

### Consequences (if ACCEPTED as proposed)

- Practice gains a mic-gated tuner and an inline reference view without new vendors, keys, server state, or sync promises it cannot keep.
- Scoring is explicitly OUT, so no score UX, no reference-track modeling, and no “accuracy without ground truth” confusion surface.
- YouTube never becomes a sync source: ADR-0031 follow-along stays file-audio-only.

### Non-goals

Per-note feedback (no reference melody) · server pitch detection · audio recording · IFrame API control · YouTube search/extraction · follow-along sync on YouTube · karaoke scoring · Whisper · cloud LLM · Q9 · S3 · 5 MiB raise · MusicXML · Event/RSVP mail

---

## ADR-0036 — Q9 realtime thin: self-hosted SignalR conductor (single Event room)

- **Status:** **ACCEPTED** — **HUMAN-DELEGATED 2026-09-20** (Kevin: program continues until done; auditor decides technical spend-free scope)
- **Date:** 2026-09-20
- **Depends on:** ADR-0009, 0011 (cookie session), ADR-0012 (Owner/Member), ADR-0016, 0018 (Event plan), ADR-0019 (tenancy/AuthZ), ADR-0020 (CSRF), ADR-0027, 0029, 0031 (Practice player + follow-along)
- **Revises:** ADR-0027 / ADR-0029 / ADR-0031 clauses keeping multi-device sync FUTURE — Owner-conducted position broadcast (this ADR only) is now authorized; all other realtime (audio sync, beat-clock, chat, recording) stays FUTURE
- **Does not authorize (firewall):** Azure SignalR Service or any hosted realtime vendor (self-hosted only — vendor/cost ban); audio streaming; beat-clock; chat; multi-conductor; recording; backplane/multi-instance scale-out; raising the 5 MiB blob cap; Whisper / cloud LLM; pitch; YouTube; S3; MusicXML; Event/RSVP mail

### Context

Practice (ADR-0027/0029) plays per-device: every musician presses play on their own clock. Follow-along (ADR-0031) highlights the current ChordPro line from Owner-authored marks — still per-device. Groups rehearsing together need a thin **conductor**: one Owner broadcasts “we are here” and Members' Practice views follow. Full realtime (audio sync, beat-clock, chat) is out; a throttled position broadcast over self-hosted SignalR is the smallest useful slice and answers CONTEXT **Q9** (realtime, lean no) for the conductor case only.

### Proposal (ACCEPTED — Q9-Q1–Q5 resolved 2026-09-20, HUMAN-DELEGATED)

1. **Transport thin:** self-hosted ASP.NET Core SignalR Hub (in-process, same deployable per ADR-0003). **NO Azure SignalR Service** — vendor/cost ban. Single-instance assumption: **no backplane, no sticky-session design** in thin (documented limitation, not silent).
2. **Room model:** single Event room `event-{id}`. Client methods `JoinRoom` / `LeaveRoom`; server pushes a **presence list** (who is in the room).
3. **Conductor broadcast:** Owner-conductor sends `BroadcastPosition({arrangementId, positionMs, playing})`, **throttled 1 Hz** (Q9-Q1 decided: client sends at most 1 Hz; server enforces a minimum 900 ms gap per connection and silently drops faster messages with a debug log). Members receive and move their Practice playhead/highlight; Members never broadcast. **Conductor: ANY Owner present may broadcast — last-writer-wins** (Q9-Q2 decided: no election, no baton; documented in code + spec).
4. **Non-goals (explicit):** audio streaming, beat-clock, chat, multi-conductor, recording.
5. **AuthZ:** Hub requires `[Authorize]` (cookie session); **per-method Membership recheck** — non-member/unknown Event → 404, member non-Owner attempting conduct → 403 (per ADR-0019); conductor role Owner-only (any Owner present, last-writer-wins per Q9-Q2). CSRF: **`X-CSRF-TOKEN` header REQUIRED on `/negotiate` POST** (Q9-Q3 decided: same antiforgery as API unsafe methods — the global POST middleware already enforces it; GET hub/WebSocket traffic needs nothing beyond the cookie).
6. **Resilience notes:** sleep drops sockets + client auto-reconnect; `Context.User` cached at connect (re-validate Membership per method call, not just at connect); Spanish copy decided (Q9-Q4): follow toggle **“Seguir al director”**, live badge **“En vivo”**, reconnecting **“Reconectando…”**; follow preference persisted per event in `localStorage`. Room caps decided (Q9-Q5): **50 connections max per event-room**; join over cap → clear Spanish error; presence list capped likewise.
7. **Spanish UI** for join/follow surfaces (“Seguir al director”, “En vivo”, “Reconectando…” — decided Q9-Q4).
8. **Tickets:** T-Q9-00 (proposal docs); T-Q9-01–03 implementation — see [`PHASE-Q9-SPEC.md`](PHASE-Q9-SPEC.md).

### Resolution (ACCEPTED 2026-09-20, HUMAN-DELEGATED — auditor decisions, zero spend scope)

| ID        | Decision                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Q9-Q1** | **1 Hz**: client sends at most 1 Hz; server enforces minimum 900 ms gap per connection, drops faster messages silently with debug log.                                   |
| **Q9-Q2** | **Any Owner present may broadcast** (last-writer-wins, documented in code + spec). No election.                                                                          |
| **Q9-Q3** | **`X-CSRF-TOKEN` header REQUIRED on `/negotiate` POST** (same antiforgery as API unsafe methods); GET hub traffic needs none beyond cookie.                              |
| **Q9-Q4** | Copy: **“Seguir al director”** (follow toggle), **“En vivo”** (live badge), **“Reconectando…”** (reconnecting). Follow preference persisted per event in `localStorage`. |
| **Q9-Q5** | **50 connections max per event-room**; join over cap → clear Spanish error; presence list capped likewise.                                                               |

### Open questions (resolved — see Resolution above; kept for reference)

| ID        | Question                                                                                                             | Answer                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Q9-Q1** | Broadcast rate: 1 Hz vs 2 Hz for `BroadcastPosition` (battery/traffic vs follow smoothness)?                         | **1 Hz** + 900 ms server gap.                           |
| **Q9-Q2** | Conductor definition: any Owner present, or a designated single conductor (first-join / explicit “tomar la batuta”)? | **Any Owner present, last-writer-wins.**                |
| **Q9-Q3** | CSRF on `/negotiate`: exact posture for the cookie-authed negotiate endpoint under ADR-0020.                         | **`X-CSRF-TOKEN` required on POST.**                    |
| **Q9-Q4** | Spanish reconnect copy: exact strings for dropped/reconnecting/live states.                                          | **“Seguir al director” / “En vivo” / “Reconectando…”.** |
| **Q9-Q5** | Room caps: max members per `event-{id}` room + over-cap behavior.                                                    | **50/room; Spanish error on over-cap.**                 |

### Consequences (if ACCEPTED as proposed)

- Sonivo gains its first websocket surface (one Hub, one room pattern, one broadcast message) — still no audio transport, no vendor realtime dependency.
- Practice follow stays file-audio-only per device; the conductor message only moves the playhead/highlight, it does not stream or clock audio.
- Single-instance limitation is documented; scale-out (backplane/sticky) needs its own ADR.

### Non-goals

Azure SignalR / hosted realtime · audio streaming · beat-clock · chat · multi-conductor · recording · backplane/sticky multi-instance · Whisper · cloud LLM · pitch · YouTube · S3 · 5 MiB raise · MusicXML · Event/RSVP mail

---

## ADR-0035 — Cloudflare R2 (S3-compatible) as alternate `IBlobStore` backend (thin)

- **Status:** **ACCEPTED** — **HUMAN-DELEGATED 2026-09-21** (Kevin: auditor resolves R2-Q1–Q7 per the proposal within the facts below; no scope beyond the thin cutover)
- **Date:** 2026-09-20
- **Accepted:** 2026-09-21
- **Depends on:** ADR-0010 (S3-compatible storage via abstraction), ADR-0019 (tenancy/AuthZ), ADR-0020 (CSRF), ADR-0023 (soft-delete; blobs left in place), T-3.2.06 (`IBlobStore` + Postgres `ResourceBlobs`, 5 MiB cap)
- **Revises:** nothing — ACCEPTED 2026-09-21: authorizes an alternate `IBlobStore` backend alongside the Postgres default; no AuthZ/tenancy/soft-delete semantic changes
- **Does not authorize (firewall):** AuthZ/tenancy changes of any kind; soft-delete semantic changes; public buckets; browser-direct reads/writes (bare presigned URLs); raising the 5 MiB cap; Whisper / cloud LLM / audio digitizer changes; unattended ML auto-marks; Q9 realtime; pitch; YouTube; MusicXML / Guitar Pro; Event/RSVP mail; dropping the `ResourceBlobs` table before verified backfill

### Context

File Resources (T-3.2.06) store bytes in Postgres (`ResourceBlobs`) behind the `IBlobStore` abstraction, capped at 5 MiB, served through the AuthZ'd `GET .../content` proxy. Postgres blobs are operationally sufficient today but couple binary growth to the primary database. A thin **alternate backend** on Cloudflare R2 (S3-compatible) would let deployments offload bytes without changing the Resource model, AuthZ, or read path.

### Decision (ACCEPTED 2026-09-21 — R2-Q1–Q7 resolved in Open questions below, kept for reference)

1. **Backend thin:** new `R2BlobStore : IBlobStore` in Infrastructure, registered **conditionally** (R2 configured → R2, else Postgres default). No change to the `IBlobStore` contract or the `GET .../content` route shape.
2. **Verified facts informing the proposal (vendor docs, `developers.cloudflare.com/r2/pricing` + documented R2 dotnet example — re-verify at implementation time):**
   - R2 free tier includes 10 GB-months storage + 1M Class-A + 10M Class-B operations/month + **zero egress fees**.
   - S3-compatible ops Put/Get/Delete/Head + presigned URLs are supported; gaps (ACLs, tagging, KMS, POST-presigns) are **unused by Sonivo** and stay unused.
   - `AWSSDK.S3` against R2 needs `DisablePayloadSigning` + `DisableDefaultChecksumValidation`, `ServiceURL https://<ACCOUNT>.r2.cloudflarestorage.com`, region `auto` (per the documented R2 dotnet example).
3. **Server proxy stays:** KEEP the server proxy through the AuthZ'd `GET .../content` (per-request Membership recheck per ADR-0019). **No public buckets, no bare presigned reads** — bearer-token URL risk. (Browser-direct PUT is likewise OUT — no CORS surface needed; see R2-Q4.)
4. **Config (never in git):** `R2:AccountId` / `R2:AccessKey` / `R2:Secret` / `R2:BucketName`, per-env (local / Render). Secrets live in environment config only.
5. **Migration (dual-read + lazy backfill, proposed):** dual-read R2-first with Postgres fallback; lazy backfill of `ResourceBlobs` rows into R2 on read; `Resource` rows/metadata stay in Postgres always. Drop the `ResourceBlobs` table only in a **later migration after verified backfill** — never in the thin cutover.
6. **Cap unchanged:** 5 MiB upload cap UNCHANGED unless a later ADR says otherwise.
7. **Spanish UI:** no user-visible copy change expected in thin (ops-only); any error copy stays Spanish.
8. **Tickets:** T-R2-00 (this proposal docs); T-R2-01–03 implementation — see [`PHASE-R2-SPEC.md`](PHASE-R2-SPEC.md). ACCEPTED 2026-09-21 (HUMAN-DELEGATED, R2-Q1–Q7 resolved above).

### Open questions (resolved 2026-09-21, HUMAN-DELEGATED — auditor decisions; kept for reference)

| ID        | Question                                                                                                                                                                                                | Answer                                                                                                                                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R2-Q1** | Account ownership + Admin token holder: whose Cloudflare account owns the R2 account, who holds the Admin token?                                                                                        | **Kevin's Cloudflare account.** The app never holds an Admin token — it uses only the scoped bucket token below (R2-Q3). The Admin token stays with Kevin and never enters app config.                                                                                                                                       |
| **R2-Q2** | Bucket name + jurisdiction: canonical bucket name(s) per environment + jurisdiction/data-location choice.                                                                                               | **Bucket `sonivo-blobs`** (all environments unless a later ADR says otherwise); **jurisdiction automatic** (no pinned data location in thin).                                                                                                                                                                                |
| **R2-Q3** | Scoped read/write token + per-env secret storage: least-privilege token scope, rotation story, where secrets live per environment (local / Render env). Never in git.                                   | **Object Read & Write scoped to `sonivo-blobs` ONLY.** Local: this machine's user environment (`R2__AccountId` / `R2__AccessKey` / `R2__Secret` / `R2__BucketName`). Render env provisioning is Kevin's ops step (later, not this slice). Never in git. Rotation: revoke + reissue in Cloudflare dashboard (no code change). |
| **R2-Q4** | Proxy-only confirm: confirm server-proxy-only (no browser-direct PUT → no CORS needed), no public buckets / bare presigned reads.                                                                       | **Confirmed proxy-only.** Server proxy through AuthZ'd `GET .../content` stays; **no public buckets, no bare presigned reads, no browser-direct PUT, no CORS surface.**                                                                                                                                                      |
| **R2-Q5** | Orphan-blob lifecycle vs ADR-0023: ADR-0023 leaves Resource rows/blobs in place on Arrangement soft-delete — confirm the same rule applies to R2 objects (purge stays FUTURE) or define the R2 variant. | **Orphans stay — same rule as Postgres.** No R2 lifecycle rule in thin; purge stays FUTURE behind its own ADR.                                                                                                                                                                                                               |
| **R2-Q6** | Cost ceiling / overage acceptance: who accepts overage beyond the free tier, alerting/ceiling story.                                                                                                    | **Free-tier-only scope.** No quota enforcement in code (documented, not silent) — the only coded guard remains the unchanged 5 MiB cap. Monitoring/overage acceptance is Kevin's ops concern.                                                                                                                                |
| **R2-Q7** | Card-on-file at R2 checkout (unconfirmed in docs): confirm whether card is required and who provides it.                                                                                                | **No card action in this slice.** Provisioning (whatever Cloudflare checkout requires) is Kevin's ops step alongside Render env (R2-Q3); the thin code assumes only the four `R2__*` values.                                                                                                                                 |

### Consequences (if ACCEPTED as proposed)

- Deployments with R2 configured store new bytes in R2; Postgres remains the default/fallback and the metadata store.
- The `GET .../content` AuthZ posture is unchanged (proxy, per-request Membership recheck, 404/403 per ADR-0019).
- The `ResourceBlobs` table survives until a later verified-backfill migration explicitly drops it.

### Amendment — T-R2-04 filesystem fallback + table drop (2026-09-21)

Unconfigured environments (local dev without `R2__*`, CI) keep working through a new `FileSystemBlobStore` (ephemeral temp dir, `Blobs:FileSystemDirectory` override) instead of Postgres: R2 configured → `R2BlobStore`; else filesystem. `PostgresBlobStore`, `DualReadBlobStore`, the `ResourceBlob` entity and the `ResourceBlobs` table are removed (migration `DropResourceBlobs`, downgrade recreates the empty table). Lazy-backfill machinery goes away with `DualReadBlobStore`. This amendment is covered by the original “drop after verified backfill” condition — the merge gate is the backfill count check, not this code.

### Non-goals

AuthZ/tenancy changes · soft-delete semantic changes · public buckets / bare presigned URLs · browser-direct PUT / CORS · 5 MiB raise · Whisper · cloud LLM · unattended ML auto-marks · Q9 · pitch · YouTube · MusicXML · Event/RSVP mail

---

## ADR-0034 — ML timing-mark suggest (review-gated mapping assist)

- **Status:** **ACCEPTED** — **HUMAN-DELEGATED 2026-09-20** (Kevin: program continues until done; auditor decides technical spend-free scope)
- **Date:** 2026-09-20
- **Depends on:** ADR-0032 (digitizer segments + review UX); ADR-0025 (PATCH/409); ADR-0028 (ChordPro)
- **Revises:** nothing — T-W32-02 already defaults segment→line identity; this ADR authorizes one smarter client-side suggestion
- **Does not authorize:** auto-save of any marks (every write still requires Owner Aplicar via PATCH), cloud LLM, Q9, pitch, YouTube, S3, new tables, server changes of any kind

### Context

T-W32-02 pre-fills each transcript segment to its positional line (segment i → line i). Real ChordPro bodies carry directives (`{start_of_verse}`), comments, and blank lines, so identity mapping plants marks on non-lyric lines. Owners then hand-fix every row. A deterministic, review-gated suggester closes the remaining Wave C gap: ML segments exist (Wave A), unattended auto-save stays forbidden (firewall).

### Decision (ACCEPTED)

1. **Pure client function `suggestLineMapping(chordProText, segmentCount)`** (web, `digitize.ts`): collect 0-based indices of lyric-bearing lines — non-blank lines that are not `{directive}` blocks; map segment i to the i-th lyric line; clamp overflow segments to the last lyric line. Zero lyric lines (or null/blank body) → identity clamped to `max(lineCount - 1, 0)`; zero segments → `[]`.
2. **Review UX:** one “Sugerir mapeo” button (`digitize-suggest`) in the ready phase fills the per-segment line inputs; Owner edits freely, then Aplicar/Añadir/Descartar unchanged. Suggest never writes anything by itself.
3. **No server changes.** No new deps. Spanish copy. Playwright **TC-WSP-02** (speech fixture: chords with a directive + a blank line; assert suggested `1`/`3`, apply, Practice toggle appears).
4. **Tickets:** T-W34-01 (this slice: util + button + TC-WSP-02). Branch `feature/t-w34-suggest-marks`.

### Consequences

- Wave C (ML auto-marks) is CLOSED as review-gated suggest; the unattended variant stays FUTURE behind its own ADR.
- Suggest is deterministic and fully covered by E2E (web has no unit framework — known gap, unchanged).

### Non-goals

Auto-save · cloud LLM · server-side mapping · Q9 · pitch · YouTube · S3 · MusicXML

## ADR-0033 — Cloud LLM upgrade of ChordPro P1 text-digitizer + P2 compose assist (thin)

- **Status:** **SUPERSEDED** — Wave B closed 2026-09-20 under Option C below (HUMAN-DELEGATED: Kevin “la opción que sea más conveniente”; auditor decision with rationale). Deterministic P1/P2 per ADR-0030 remain the standing decision. L33-Q1–Q6 recorded as resolved-moot for reference; a future ADR may reopen with usage evidence.
- **Date:** 2026-09-20
- **Depends on:** ADR-0019, 0020, 0025, 0027, 0028, 0030 (P1/P2 deterministic baseline); T-3.2.06 file/link Resources
- **Revises:** nothing yet — on ACCEPTANCE it would revise ADR-0030 §2–3 clauses that keep P1/P2 deterministic-only (“Not cloud LLM in this thin”) into an opt-in cloud-assisted upgrade; the deterministic engines stay as offline fallback
- **Does not authorize (firewall):** Whisper / audio-digitizer changes (Wave A done, ADR-0032), unattended ML auto-marks saved without Owner review (Wave C), realtime multi-device sync (Q9), pitch detection, YouTube, S3 blob adapter, raising the 5 MiB blob cap, MusicXML / Guitar Pro, Event/RSVP mail

### Context

ADR-0030 shipped P1 (Owner pastes plain lyrics + chord list → deterministic placer → ChordPro + syllable-nudge studio) and P2 (Owner brief → template/rule-generated structured ChordPro) as **deterministic** tooling with no vendor secrets. Groups now hit the ceiling of rules: P1 misplaces chords on irregular meter, P2 templates repeat themselves. A thin **cloud-LLM upgrade** would offer Owner-invoked “Mejorar con IA” / “Generar con IA” actions that send the Owner’s own draft input to a hosted LLM and return a **draft** the Owner reviews and explicitly saves — reusing the existing Arrangement PATCH (`expectedVersion` / 409 per ADR-0025) with the deterministic engines kept as the offline fallback.

### Proposal (as proposed — DECLINED under Option C; see Resolution; L33-Q1–Q6 retained as the reusable question set)

1. **Scope thin:** P1 upgrade = lyrics + chord list → LLM-proposed ChordPro placement (replaces only the placer output, still editable in the existing nudge studio). P2 upgrade = brief → LLM-proposed structured ChordPro with `{start_of_verse}` / `{start_of_chorus}` (still editable; “variar progresión” / “reescribir sección” may call the LLM again). P0 transpose/views unchanged (deterministic, no LLM).
2. **Draft-only:** LLM output is a **draft** until an Owner explicitly saves via the existing PATCH `chords` path. No auto-save, no background generation, no unattended marks.
3. **Fallback:** deterministic P1 placer + P2 templates remain fully functional with no network/vendor configured (offline path). When the vendor is unreachable or unconfigured, the UI falls back to the deterministic output with a clear Spanish notice — exact fallback UX per L33-Q5.
4. **No new persistence tables** in thin (existing `Arrangement.Chords` text column only). No new blob MIME requirements. Server never stores vendor keys in the DB in this proposal (config model per L33-Q2).
5. **Roles:** generate actions default Owner-only (same `RequireOwnerAsync` pattern as other Arrangement mutations); Member read-only consumes saved `Chords`. Whether Members may invoke generation is L33-Q6.
6. **Spanish UI** for generate/review surfaces (“Generar con IA”, “Revisar borrador”, “Aplicar”, “Descartar”); sparse Playwright TCs per thin spec (T-LLM-03).
7. **Tickets (gated on ACCEPTANCE):** T-LLM-00 (this proposal docs); T-LLM-01–03 implementation — see [`PHASE-LLM-SPEC.md`](PHASE-LLM-SPEC.md). No implementation branch authorized until Kevin ACCEPTS and resolves L33-Q1–Q6.

### Vendor comparison (neutral — FACTS about dimensions, no recommendation stated as fact)

| Dimension                                 | Option A: hosted general LLM API (e.g. OpenAI-compatible chat endpoint)           | Option B: hosted general LLM API, alternative vendor (e.g. Anthropic-compatible messages endpoint) | Option C: no vendor (stay deterministic, close Wave B without cloud) |
| ----------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Integration shape                         | HTTPS chat-completions-style call, server-side only                               | HTTPS messages-style call, server-side only                                                        | No integration                                                       |
| Secrets / config                          | Vendor API key via server config (model per L33-Q2)                               | Vendor API key via server config (model per L33-Q2)                                                | None                                                                 |
| Cost model                                | Per-token metered billing; caps needed (L33-Q3)                                   | Per-token metered billing; caps needed (L33-Q3)                                                    | Zero marginal cost                                                   |
| Privacy surface                           | Owner-supplied lyrics/brief leave the server to the vendor (retention per L33-Q4) | Same — content leaves the server to the vendor (retention per L33-Q4)                              | Content never leaves the server                                      |
| Offline behavior                          | Falls back to deterministic engines (L33-Q5)                                      | Falls back to deterministic engines (L33-Q5)                                                       | Always available                                                     |
| Output quality (ASSUMPTION, not verified) | Expected better placement/variety than rules                                      | Expected better placement/variety than rules                                                       | Capped at rule quality                                               |

_Auditor lean (clearly labeled opinion, NOT a decision): Option A or B are functionally interchangeable for this thin — the binding choice is Kevin’s (L33-Q1). If forced to pick a default for the proposal, the auditor would lean toward whichever vendor Kevin already bills (to avoid a second paid account), with per-group opt-in + hard caps; but this lean authorizes nothing and must not be read as ACCEPTED._

### Resolution — Wave B closed under Option C (2026-09-20, HUMAN-DELEGATED)

**Decision: Option C — no cloud vendor.** Rationale: (1) zero marginal cost vs metered billing with no billing infra; (2) zero secrets/ops burden (no keys, rotation, caps monitoring); (3) user lyrics never leave the server (no retention policy or consent surface needed); (4) single always-available path (no degraded fallback UX to design); (5) deterministic P1/P2 already deliver the thin value (ADR-0030, shipped + tested); (6) no usage evidence that rules are insufficient — buying vendor capacity now would be premature. **Reversible:** a future ADR may reopen the upgrade with usage evidence; L33-Q1–Q6 stand answered-moot and reusable as the question set.

### Open questions (Kevin decides — auditors do NOT commit unilaterally)

| ID         | Question                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **L33-Q1** | Vendor choice: OpenAI vs Anthropic vs other vs Option C (no cloud)? Auditors do not commit Sonivo to a paid vendor unilaterally.               |
| **L33-Q2** | Secrets/config model + per-env provisioning: config key names, where keys live per environment (local / Render), rotation story. Never in git. |
| **L33-Q3** | Cost caps / rate limits: per-group quotas, max tokens per call, monthly ceiling, behavior when exceeded.                                       |
| **L33-Q4** | Privacy: lyrics/briefs are user content sent to the vendor — retention policy, data-processing terms, user notice/consent copy.                |
| **L33-Q5** | Fallback behavior when the vendor is unreachable or unconfigured: exact UX + whether generation buttons hide or degrade to deterministic.      |
| **L33-Q6** | Member vs Owner access to generate actions: Owner-only (default) or Members may generate drafts for Owner save?                                |

### Consequences (if ACCEPTED as proposed)

- P1/P2 gain an opt-in cloud draft path; deterministic engines stay as the offline fallback.
- Sonivo gains its first paid-vendor dependency and first user-content-egress surface — both bounded by L33-Q1–Q6 answers.
- Wave C (unattended ML auto-marks) still needs its own ADR; this thin must not be read as authorizing it.

### Non-goals

Whisper changes · unattended ML auto-marks · Q9 realtime/multi-device · pitch · stems/mixer · YouTube · S3 · raising 5 MiB · MusicXML · Guitar Pro · Event/RSVP mail

---

## ADR-0032 — Whisper audio digitizer thin (audio → timing-mark + lyric drafts)

- **Status:** **ACCEPTED** — **HUMAN-DELEGATED 2026-09-20** (Kevin: “elige las opciones que queden mejor para el proyecto e implementa”; auditor decided W32-Q1–Q7 below, rationale in PR)
- **Date:** 2026-09-20
- **Depends on:** ADR-0019, 0020, 0024, 0025, 0027, 0028, 0029, 0030, 0031; T-3.2.06 file/link Resources
- **Revises:** ADR-0030 / ADR-0031 clauses keeping audio→ChordPro digitizer FUTURE — a thin Owner-reviewed digitizer is now authorized as specified below (unattended ML auto-marks stay FUTURE, Wave C)
- **Does not authorize (firewall):** cloud LLM lyric/chord rewriting (Wave B), ML auto-marks saved without Owner review UX (Wave C), realtime multi-device sync (Q9), pitch detection, YouTube, S3 blob adapter, raising the 5 MiB blob cap, MusicXML / Guitar Pro, Event/RSVP mail

### Context

Groups rehearse from audio maquetas stored as Arrangement Resources (ADR-0024; T-3.2.06). Owners today hand-transcribe lyrics into ChordPro (`Arrangement.Chords`, ADR-0028 / ADR-0030) and hand-place Practice follow-along time marks (`Arrangement.ChordTimingJson`, ADR-0031). A thin digitizer turns an **existing audio file Resource** into a **draft** the Owner reviews and explicitly saves — feeding the existing `Lyrics` + `ChordTimingJson` columns with **no new tables** and **no new vendor secrets**.

### Decision (ACCEPTED — W32-Q1–Q7 resolved)

1. **Q1 provider: local whisper.cpp via Whisper.net, default model `tiny`** (config `base`). Zero vendor secrets, zero cost, audio never leaves the server. Limited transcription quality is acceptable because output is an Owner-reviewed draft only. Hosted transcription APIs remain FUTURE (Wave B-adjacent, separate ADR).
2. **Q2 execution: async job — `202 Accepted` + polling.** Transcription is CPU-bound (tens of seconds); async avoids HTTP/proxy timeouts on Render free tier. Job state lives in an **in-memory store with expiry** (no new table in thin; restarts may drop in-flight jobs — documented, not silent).
3. **Q3 eligibility: `file`-kind Resources with playable audio MIME** (purposes `audio` / `practice` / `click`, same playability rule as Practice). Link Resources are OUT (server must read bytes; link fetching is SSRF surface; YouTube is firewall). Thin decoder is WAV-only: non-WAV audio is rejected at POST with a clear Spanish error, never a doomed job.
4. **Q4 output: segments → (a) timing-mark drafts + (b) lyric-text draft. `Chords` NEVER touched by the digitizer** (protects hand-made ChordPro). Each segment `{startMs, endMs, text}` maps in review UX to `{lineIndex, atMs=startMs}` applied via the existing PATCH `chordTimingJson` path (upsert semantics — hand-made marks on other lines are preserved); segment text may be appended to `Lyrics` via explicit Owner action through the existing PATCH `lyrics` path. Smart seeding of `Chords` stays with Wave B.
5. **Q5 caps: blob ≤5 MiB (unchanged, NOT raised) + audio duration ≤120s + segments ≤500** (far below server `MaxMarks = 2000`); jobs expire after 30 min. Over-cap input fails the job with a clear error, never partial writes.
6. **Q6 config (no secrets in thin): `Whisper:Model`** (`tiny`\|`base`, default `tiny`), **`Whisper:ModelDirectory`** (model `.bin` location, environment-provisioned), **`Whisper:MaxAudioSeconds`** (default 120). Model weights download lazily on first job — never in git, never in DB. Render ephemeral disk (re-download after sleep/restart) is documented.
7. **Q7 visibility: drafts are Owner-only.** Transcription endpoints require Owner (same `RequireOwnerAsync` pattern as other Arrangement mutations); job ids are unguessable Guids scoped to `(groupId, arrangementId)` and re-checked per request (ADR-0019: 404 non-member/unknown, 403 member non-Owner). Members consume only saved `Lyrics` / marks.
8. **Writes use existing PATCH semantics only** (`expectedVersion` / 409 per ADR-0025); CSRF per ADR-0020 (POST is unsafe, GET status is safe). Concurrency mechanism unchanged.
9. **Spanish UI** for the draft review surface (“Digitalizar audio”, “Revisar borrador”, “Aplicar marcas”, “Añadir a letra”, “Descartar”); sparse Playwright **TC-WSP-01** in T-W32-03.
10. **Tickets:** T-W32-00 (proposal docs, merged PR #83); T-W32-01–03 implementation — see [`PHASE-WHISPER-SPEC.md`](PHASE-WHISPER-SPEC.md).

### Consequences

- Audio maquetas gain a draft path into follow-along marks + lyrics without new aggregates, tables, or vendors.
- “Digitizer” output stays a **draft** until an Owner saves it; saved `Lyrics` / `ChordTimingJson` keep current GET/PATCH/AuthZ semantics.
- Wave B (cloud LLM upgrade) and Wave C (unattended ML auto-marks) each need their own ADR; this thin must not be read as authorizing them.

### Non-goals

Cloud LLM rewriting · unattended ML auto-marks · Q9 realtime/multi-device · pitch · stems/mixer · YouTube · S3 · raising 5 MiB · MusicXML · Guitar Pro · Event/RSVP mail

---

## ADR-0031 — Practice ChordPro follow-along (Owner time marks + highlight)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-18** Kevin Esquivel — authorize follow-along thin (full backlog program)
- **Date:** 2026-09-18
- **Depends on:** ADR-0027, 0028, 0029, 0030
- **Revises:** ADR-0029 clause that treated time-synced lyric/ChordPro marks as FUTURE-only — Practice MAY highlight the current ChordPro line (or block) from Owner-authored timing marks while audio plays
- **Does not authorize:** Whisper / cloud STT, cloud LLM, auto-generated marks from ML, realtime multi-device sync (Q9 — except Owner-conducted position broadcast per ADR-0036), pitch detection, YouTube, S3 blob adapter, raising the 5 MiB blob cap

### Context

ADR-0029 shipped a usable Practice player with manual ChordPro scroll. Musicians still lose their place when rehearsing with audio. Full karaoke/realtime (Q9) and ML-generated marks are out of scope; a thin **Owner-authored** timing map plus client highlight reuses the existing HTML5 `timeupdate` path.

### Decision (ACCEPTED)

1. **Product:** while Practice audio plays, ChordPro **highlights the current line** (or contiguous block) driven by Owner-authored time marks. Toggle optional **“Seguir letra”** (on/off; prefer `localStorage` for the preference).
2. **Source of truth** for chart text remains `Arrangement.Chords` (ChordPro) per ADR-0028 / 0030. Timing does **not** replace or fork ChordPro into a second body.
3. **Timing persistence:** nullable string column **`ChordTimingJson`** on **Arrangement** (not overloaded into `Notes`). JSON array of `{ "lineIndex": number, "atMs": number }` (0-based line index into the ChordPro body as rendered/split for mark editing; `atMs` = audio position in milliseconds). Empty / null = no follow-along marks. One nullable column only — **no new table**. EF migration lands in **T-SYNC-01** (not docs-only).
4. **Roles:** Owner creates/edits/clears marks (PATCH Arrangement); Member **read-only** consumes marks on Practice. Same AuthZ pattern as other Arrangement body fields.
5. **Player:** reuse ADR-0029 custom chrome / HTML5 `<audio>` `timeupdate` (and seek) to resolve the active mark — no websocket, no conductor.
   **REVISED by ADR-0036:** an Owner-conducted position broadcast (1 Hz, last-writer-wins) MAY additionally move the local playhead/highlight; the per-device `timeupdate` path remains the local source of truth.
6. **Spanish UI**; sparse Playwright **TC-PLAY-SYNC-01** in T-SYNC-03.
7. **Tickets:** T-SYNC-00 (this ADR + [`PHASE-PLAY-SYNC-SPEC.md`](PHASE-PLAY-SYNC-SPEC.md)); T-SYNC-01–03 implementation — see that spec.
8. **Firewall unchanged except ADR-0036:** no Whisper, cloud LLM, ML auto-marks; Q9 realtime beyond the Owner-conducted position broadcast stays FUTURE; no pitch, YouTube, S3, raising 5 MiB.

### Consequences

- ADR-0029 Wave 2 “manual scroll only / time-sync FUTURE” is superseded for **Owner-authored** follow-along highlight (not multi-device realtime).
- Arrangement GET/PATCH grow one optional field; Practice highlight is SPA-only given marks + audio.
- Whisper / audio digitizer remain a later ADR (may seed marks later; not this thin).

### Non-goals

Whisper · cloud LLM · ML auto-marks · Q9 multi-device · pitch · YouTube · S3 · MusicXML · karaoke scoring

---

## ADR-0030 — ChordPro rehearsal intelligence module (transpose, text digitizer, compose assist)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-18** (Kevin Esquivel — “Acepto todo” on ChordPro+IA product proposal)
- **Date:** 2026-09-18
- **Depends on:** ADR-0025, 0027, 0028, 0029
- **Revises:** ADR-0028 non-goal that treated **transpose** as FUTURE-only — Practice/Arrangement MAY offer visual (and Owner-save) transposition of ChordPro chord tokens
- **Does not authorize:** Whisper / cloud STT, cloud LLM providers, audio→ChordPro digitizer, pitch detection, YouTube, realtime conductor (Q9), MusicXML, Guitar Pro, raising 5 MiB blob cap

### Context

Groups need ChordPro that stays syllable-aligned, changes key in rehearsal, and can be created from messy inputs (plain lyrics + loose chords) or from a creative brief — without leaving Sonivo’s Arrangement-centric library. Full “AI” (Whisper + LLM) is desirable later; thin must ship value without new vendor secrets or opaque server ML.

### Decision (ACCEPTED)

1. **Source of truth** remains `Arrangement.Chords` (and optional `Lyrics`) as ChordPro-compatible text (ADR-0028). No orphan `.cho` aggregate.
2. **Priority slices (authorized now):**
   - **P0 — Transposición + vistas de ensayo:** client transpose of `[chord]` tokens by semitone; Practice view modes (p.ej. cantante / guitarrista: hide or emphasize chords). Prefs in `localStorage`. Owner MAY **Guardar tono** (PATCH chords + optional `defaultKey`) after confirming.
   - **P1 — Digitalizador de texto (thin):** Owner pastes plain lyrics + ordered/loose chord list; a **deterministic** placer produces ChordPro; UI “estudio” to nudge chords by syllable/word (click / ←→). Soft confidence styling optional. **Not** cloud LLM in this thin.
   - **P2 — Asistente de composición (thin):** Owner-only brief (género, tonalidad, idea); generates structured ChordPro with `{start_of_verse}` / `{start_of_chorus}` via **templates/rules**; actions: variar progresión, reescribir una sección manteniendo métrica cuando sea posible. **Not** cloud LLM in this thin.
3. **Deferred (explicit FUTURE ADRs):** audio digitizer (Whisper + chord timeline), cloud LLM upgrade of P1/P2, diagram frets as first-class, realtime sync.
4. **Roles:** P1/P2 write paths **Owner**; P0 view modes + local transpose preview **Owner + Member**; save transpose to server **Owner**.
5. **No new persistence tables** for thin. No new blob MIME requirements beyond T-3.2.06.
6. **Spanish UI.** Playwright sparse TCs per thin spec.
7. **Firewall unchanged:** no Q9, pitch, YouTube, Event/RSVP mail expansion.

### Consequences

- Transpose becomes a first-class Practice control.
- “IA” in marketing for P1/P2 thin means **assisted deterministic tooling**; vendor AI is a later ADR.
- Audio maquetas remain normal `audio` Resources until a digitizer ADR.

### Non-goals

Whisper · OpenAI/Anthropic/etc. in-process · realtime · pitch · stems · MusicXML

---

## ADR-0029 — Practice audio player (Arrangement v1; Event/Setlist queue next)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-17** (Kevin Esquivel — “Acepto todo” Wave plan)
- **Date:** 2026-09-17
- **Depends on:** ADR-0027, 0028; T-3.2.06 file/link Resources
- **Revises:** ADR-0027 “single primary `<audio>` control” — Practice MAY use a custom player chrome over the same HTML5 media element
- **REVISED by ADR-0031:** Owner-authored ChordPro line timing + Practice highlight (“Seguir letra”) is **authorized**; multi-device realtime (Q9) remains FUTURE
- **REVISED by ADR-0036:** Owner-conducted position broadcast (any Owner present, last-writer-wins, 1 Hz) is **authorized**; all other multi-device realtime remains FUTURE
- **Does not authorize:** realtime sync (Q9 — except ADR-0036 conductor broadcast), pitch detection, YouTube API, streaming CDN, stems mixer, raising the 5 MiB blob cap (separate ops ADR)

### Context

Thin Practice (ADR-0027) exposes one playable Resource via native browser controls. Musicians need a **usable rehearsal player**: seek, volume, and choosing among multiple `audio`/`click` Resources while reading ChordPro/lyrics. Setlist/Event queue is valuable but must not block Arrangement v1.

### Decision (ACCEPTED)

1. **Scope Wave 2 (Arrangement player):** enhance the existing Practice route for one live Arrangement — no new domain aggregates, no new API endpoints required. Reuse GET Arrangement + Resource list + file `content` AuthZ.
2. **Chrome:** custom control bar (Spanish): reproducir/pausar, seek, tiempo actual/duración, volumen. Prefer one HTML5 `<audio>` under the hood (hidden or visually secondary).
3. **Track list:** list all playable Resources with purpose `audio` then `click` (same playability rules as today). User may switch track; switching resets or keeps playhead per thin UX (default: reset to 0). Prefer last-selected track from `localStorage` when still present.
4. **Lyrics / ChordPro:** keep ADR-0028 render beside/above the player. **Manual** scroll only in Wave 2. ~~Time-synced auto-scroll / lyric marks = FUTURE (needs format + Q9-adjacent ADR).~~ **REVISED by ADR-0031:** Owner-authored timing marks + optional highlight (“Seguir letra”) are authorized; Q9 multi-device sync remains FUTURE.
5. **UX persistence:** volume + last track Resource id in `localStorage` keyed by Group/Arrangement — **not** server state.
6. **Scope Wave 3 (authorized by this ADR, separate tickets):** Event plan / Setlist ordered queue with next/prev, title per item, jump to that Arrangement’s Practice. Still no realtime.
7. **Spanish UI** labels for player chrome.
8. **Playwright:** TC-PLAY-01 (play + seek + change track) for Wave 2; TC-PLAY-02 for Wave 3 queue.

### Consequences

- Practice becomes the product “player” surface without a second route.
- Wave 3 builds on the same chrome with a playlist model in the SPA.
- Large-file / S3 remains ops (T-BLOB-S3) when Neon/size hurts — not a prerequisite for Wave 2.

### Non-goals

Pitch · YouTube · karaoke scoring · conductor/realtime · multi-device sync · Event notification mail · MusicXML

---

## ADR-0028 — Chart / lyrics format (closes Q8) — hybrid ChordPro + file chart

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-17** (Kevin Esquivel — “Acepto todo” Wave plan)
- **Date:** 2026-09-17
- **Depends on:** ADR-0007, 0014, 0017, 0024–0025, 0027
- **Revises:** ADR-0027 clause that treated ChordPro as FUTURE-only for Practice display — Practice **may** render ChordPro from Arrangement fields
- **Closes:** CONTEXT **Q8** (chart format) for MVP practice/edit path
- **Does not authorize:** MusicXML, Guitar Pro, realtime lyric sync (Q9), pitch detection, YouTube

### Context

Arrangement already has optional plain-text `Lyrics` / `Chords` / `Structure` / `Notes` (ADR-0025). Resources carry PDF/image/audio. Without a format decision, Practice and editors stay opaque. Musicians need a **typed** rehearsal format without replacing file charts.

### Decision (ACCEPTED)

1. **Hybrid model (option C):**
   - **Editable rehearsal body:** `Arrangement.Chords` (and optionally `Lyrics`) MAY hold **ChordPro-compatible** text (OpenSong/ChordPro common subset).
   - **Official / print chart:** Resource with purpose `chart` remains **file or link** (PDF/PNG/JPEG/WebP) — not parsed.
2. **`Lyrics` field:** plain text **or** ChordPro lyric lines without chords; no requirement to migrate existing rows.
3. **`Chords` field:** preferred home for ChordPro (chords + lyrics inline). Empty still allowed.
4. **Validation (thin):** server accepts ChordPro as **opaque text** within existing max body length; **no** hard reject for unknown directives. Optional soft warnings are UI-only in this wave. Do **not** invent a second storage column.
5. **Rendering:** Practice and Arrangement detail MAY render ChordPro into readable chords-over-lyrics when the text looks like ChordPro (`[` chord brackets or `{` directives). Fallback: monospace / preformatted plain text.
6. **Import:** Owner MAY upload/paste a `.cho` / `.chordpro` / `.txt` ChordPro body into `Chords` (and optionally clear-file import via existing file Resource is **not** required for this ADR). Thin: paste + file-pick that reads client-side into the PATCH body.
7. **MIME:** keep T-3.2.06 allowlist; `.cho`/`.chordpro` as `text/plain` (or add explicit types if browsers send them) — still ≤5 MiB when stored as Resource; Arrangement body remains DB text not blob.
8. **~~Transpose, sections UI, MusicXML:~~** **REVISED by ADR-0030:** visual + Owner-save transpose of ChordPro tokens is authorized (P0). Sections UI polish and MusicXML remain FUTURE.
9. Spanish UI: “Letra”, “Acordes (ChordPro)”, “Vista previa”.

### Consequences

- Q8 answered for Sonivo MVP practice path.
- Parser/renderer lives in web (and optionally shared tests); Domain keeps strings.
- ADR-0027 Practice view gains ChordPro display without new aggregates.

### Non-goals

MusicXML · Guitar Pro · OCR PDF · realtime scroll sync · forcing all Groups to ChordPro

---

## ADR-0027 — Thin practice / karaoke view (read-only Arrangement play)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-17** (Kevin Esquivel — “Acepto todo” pipeline)
- **Date:** 2026-09-17
- **Depends on:** ADR-0007–0008, 0014, 0017, 0024–0025; T-3.2.06 file/link Resources
- **Does not supersede:** Resource model; Event plan snapshots; Auth cookie model
- **Does not authorize:** realtime sync (Q9 — except Owner-conducted position broadcast per ADR-0036), pitch detection, YouTube API, multi-user live conductor (except ADR-0036 conductor)
- **REVISED by ADR-0028:** ChordPro parser/render on Practice is **authorized** (hybrid ChordPro in Arrangement fields). The original “no ChordPro parser” thin ban no longer binds.
- **REVISED by ADR-0029:** Practice MAY use custom player chrome (seek/volume/multi-track) over HTML5 audio; Event/Setlist queue is Wave 3 under the same ADR.
- **REVISED by ADR-0031:** Owner-authored ChordPro line timing + optional Practice highlight (“Seguir letra”) is **authorized**; websocket/multi-device realtime remains FUTURE.
- **REVISED by ADR-0036:** Owner-conducted position broadcast (any Owner present, last-writer-wins, 1 Hz) is **authorized**; all other multi-device realtime (audio sync, beat-clock, chat, recording) remains FUTURE.

### Context

Members need a first-class **practice** surface: see lyrics (and optionally hear audio/click) for an Arrangement without leaving Sonivo. Full karaoke/realtime is FUTURE (Q9). Thin slice is a **read-only play view** over existing Arrangement fields + Resources.

### Decision (ACCEPTED)

1. Add a **Practice** (UI: “Practicar”) view for a live Arrangement, reachable from Arrangement detail (Member + Owner).
2. View shows: Arrangement **Label**, Song **Title**, **Lyrics** text (plain), optional **Key** / **Tempo** display. **REVISED by ADR-0028:** Lyrics/Chords MAY render as ChordPro when text looks like ChordPro.
3. If the Arrangement has a Resource with purpose `audio` or `click` (link or file), expose **one** primary playable control (HTML5 `<audio>` for file `content` or link URL when audio MIME / known audio extension). Prefer purpose `audio`, else `click`.
4. **No** new domain aggregates. **No** new persistence tables. Reuse existing GET Arrangement + Resource list + file `content` AuthZ.
5. **No** websocket/realtime, **No** pitch tracking. ~~**No** scrolling sync engine beyond basic CSS scroll of lyrics~~ **REVISED by ADR-0031:** Owner time marks + highlight authorized; still **no** Event-plan karaoke mode / multi-device conductor in this thin.
6. Spanish UI copy; routes may stay English (`/practice` or query under arrangement).
7. Playwright: sparse TC — Owner opens Practicar and sees lyrics (fixture song with lyrics).

### Consequences

- Improves Member read UX without expanding Event or Resource semantics.
- ~~FUTURE ADR may add realtime / conductor / ChordPro.~~ **REVISED by ADR-0028:** ChordPro display is in-scope; realtime / conductor remain FUTURE.

### Non-goals

Realtime · multi-device sync · YouTube embed · pitch detection · billing · Google Drive

---

## ADR-0026 — Google as Identity external login (cookie session)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-17** (Kevin Esquivel — “Acepto todo” pipeline)
- **Date:** 2026-09-17
- **Depends on:** ADR-0009, 0011, 0020
- **Does not supersede:** Identity as sole AuthN (0009); HTTP-only cookie web session (0011); antiforgery CSRF (0020)
- **Does not touch:** Phase 3.9 `Gmail:*` outbound mail credentials

### Context

Email/password Identity works. Registration friction remains. Gate B forbade a Google button during UI cut; that gate is closed. External login must stay under ASP.NET Identity and the existing `sonivo.auth` cookie — no JWT web auth, no BFF (0009/0011).

### Decision (ACCEPTED)

1. Add **Google** as an **Identity external authentication** provider (`AddGoogle` / challenge → callback).
2. On successful callback: create or link `ApplicationUser`, record `AspNetUserLogins`, then **`SignInAsync`** into the existing **`sonivo.auth`** application cookie.
3. Email/password register + login **remain**.
4. Config keys: **`Authentication:Google:ClientId`** / **`ClientSecret`** (and optional callback path). **Never** reuse `Gmail:ClientId` / `ClientSecret` / `RefreshToken`.
5. Scopes thin: **`openid` `email` `profile`** only — no Gmail/Drive user scopes.
6. **Email linking:** auto-link an existing password account **only** when Google asserts **`email_verified`**. Otherwise create a distinct user or require password sign-in then link (thin default: create when email not found; link when verified email matches).
7. When Google asserts verified email, set **`EmailConfirmed = true`**.
8. Google-only users may have no usable password; lockout/reset UX for them is **out of thin**.
9. Preserve join **`?next=`** through OAuth `state` with **allowlist** (same-origin relative paths only — no open redirect).
10. CSRF: keep ADR-0020 for mutating cookie APIs; OAuth callback remains the Identity redirect GET.
11. CI / Playwright: **no live Google secrets required** — unit/integration with mocked external login; E2E for Google path may be skipped or faked.
12. UI: AuthScreen control **“Continuar con Google”** (Spanish).

### Consequences

- Web session model unchanged (cookie + CSRF).
- Ops must provision a **separate** Google Cloud OAuth client for user sign-in.
- Account linking/unlink UI, multi-provider, mobile bearer = FUTURE ADRs.

### Non-goals

JWT/BFF · Supabase/Clerk · reusing Gmail send credentials · Drive/Gmail API on user tokens · Event/RSVP mail

---

## ADR-0025 — Song & Arrangement MVP field model

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-15** (Phase 3.1 closure)
- **Date:** 2026-09-15
- **Depends on:** ADR-0007, 0014, 0015, 0016, 0017, 0018, 0022, 0023, 0024
- **Revises:**
  - ADR-0007 clause “Creating a Song creates a Default Arrangement” → **not** a domain invariant
  - ADR-0017 ASSUMPTION that Song create always creates Default Arrangement
  - Persistence sketch `Songs.IsOriginal` boolean → **`OriginKind`** enum (`original` \| `cover` \| `other`)
  - Persistence `DefaultBpm` → **nullable integer** BPM (1–400) when set
  - Persistence / Phase 2.2 sketch **`IsDefault` removed from MVP** (no preferred-Arrangement flag)
- **Does not supersede:** Song/Arrangement aggregate split (0007/0014); zero Arrangements ALLOW (0017); Event identity copies (0018); soft-delete/filters (0023); Resource model (0024)
- **Aligns with:** PERSISTENCE / ADR-0023 Application soft-delete of Arrangements when Song is soft-deleted

### Context

Phase 3.1 freezes Song vs Arrangement identity and field representations. Challenge passes rejected MVP `IsDefault` and confirmed Song→Arrangement soft-delete cascade plus Song-level deletion concurrency (§8a).

### Decision (ACCEPTED)

#### Song (Group-scoped work identity)

1. **Identity:** `SongId` within a Group. Song is the **catalog work**, not a performable variant.
2. **No global/canonical Songs** across Groups.
3. **Title:** required, non-blank after trim. **Duplicate titles within a Group ALLOWED** — no `UNIQUE(GroupId, Title)`.
4. **Attribution:** single **optional free-text** string. No structured contributor list.
5. **OriginKind** (required): `original` \| `cover` \| `other`. Replaces boolean `IsOriginal`.
6. **RightsNotes:** optional free text. No licensing workflow.
7. **Song create does not require an Arrangement.** Zero Arrangements ALLOWED (0017). Convenience “Song + initial Arrangement” may exist as an Application use-case only (revises ADR-0007 auto-Default).
8. **Song soft-delete — CASCADE ARRANGEMENT SOFT-DELETE (Application, same transaction):**
   - Set `Song.DeletedAt` (+ bump Song `Version`).
   - Soft-delete **every Arrangement of that Song where `DeletedAt IS NULL`** (set `DeletedAt`, bump each Arr `Version`).
   - Arrangements **already** soft-deleted: leave unchanged (do not rewrite `DeletedAt`).
   - Resources: **left in place** under those Arrangements (0023).
   - SetlistItems / EventSetlistItems: **rows remain**; FKs valid (**RESTRICT**).
   - **No restore in MVP.** FUTURE restore would be an explicit multi-aggregate operation (out of scope).
   - Rationale: retiring a Song retires its live realizations; prevents “live Arrangement under deleted Song” orphans that confuse library/AuthZ; matches ACCEPTED “Arrangements inaccessible with Song soft-delete” (0017) and PERSISTENCE Application rule.

8a. **Song soft-delete concurrency contract** (`DELETE /api/groups/{groupId}/songs/{songId}`) — mirrors Group soft-delete (Phase 3.0) + ACCEPTED integer `Version` (PERSISTENCE §6):

| Rule                                          | Contract                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client `expectedVersion`                      | **Required** — Song’s current `Version` only (JSON body, same shape as Group DELETE)                                                                                                                                      |
| Per-Arrangement `expectedVersion` from client | **Not required** — Song deletion semantically retires all live Arrangements                                                                                                                                               |
| Song.Version on success                       | **Incremented** (+1) with `DeletedAt` set                                                                                                                                                                                 |
| Each live Arrangement on success              | `DeletedAt` set; **Arrangement.Version incremented** (+1 each)                                                                                                                                                            |
| Already-soft-deleted Arrangements             | Unchanged (no Version bump)                                                                                                                                                                                               |
| Transaction                                   | **One** Application/DB transaction — all-or-nothing                                                                                                                                                                       |
| Stale Song `expectedVersion`                  | **409**; **no** writes (Song or Arrangements)                                                                                                                                                                             |
| Concurrent Arrangement mutation before commit | Detected via existing Arrangement `Version` concurrency tokens (loaded at handler start / EF token). Conflict → **409**; **full rollback**; **never** partial cascade; **never** silent overwrite of concurrent Arr state |
| Partial success                               | **Forbidden**                                                                                                                                                                                                             |
| New concurrency mechanism                     | **None** — reuse integer `Version` + 409 only                                                                                                                                                                             |

#### Arrangement (separate aggregate; performable realization)

9. **Identity:** `ArrangementId` only. Label is recognition metadata, not identity.
10. **Scope:** `GroupId` + `SongId`; composite FK (0022). Cannot move Song/Group after create (0015).
11. **Label:** required, non-blank. **Not unique** per Song.
12. **DefaultKey:** optional free-text. No pitch enum.
13. **DefaultBpm:** optional **integer** 1–400 when set; **0 forbidden**.
14. **Lyrics / Chords / Structure / Notes:** optional plain text; empty → null on write. ChordPro/structured sections FUTURE (Q8).
15. **No `IsDefault` in MVP.** UI lists Arrangements by Label (and may sort by `CreatedAt` or show the sole Arrangement without a flag). Setlist/Event always reference `ArrangementId` explicitly. Progressive disclosure when only one Arrangement exists needs **count**, not a default flag.
16. **Resources:** Arrangement-owned only (0024).
17. **Arrangement soft-delete (standalone):** Resources remain; SetlistItem/EventSetlistItem FKs remain. **No restore MVP.**
18. **Versioning:** in-place mutation only. Duplicate Arrangement = FUTURE.
19. **Edit after Setlist/Event use:** live library updates; Event copied labels stable (0018). Templates are live refs; apply copies labels at apply time (0021).

#### Setlist / Event interaction

20. Cannot **add** a soft-deleted Arrangement to a Setlist. Existing SetlistItems **may** retain FK after Arr or Song soft-delete. Soft-delete Arr (or Song cascade) while referenced is **allowed**. Apply Setlist **fails** if any template Arrangement is soft-deleted (0021) — including Arrs soft-deleted via Song cascade.
21. **SetlistItems are not cascade-deleted** when Song or Arrangement is soft-deleted. Template remains; Apply is blocked until Owner removes/replaces unusable items.
22. EventSetlistItem historical display uses copied labels only — **never** requires live Song/Arrangement or `IgnoreQueryFilters()` (0018/0023).

#### Concurrency

23. Song and Arrangement integer `Version` (PERSISTENCE §6). Owner PATCH / standalone soft-delete require that root’s `expectedVersion` → **409** on mismatch. Soft-delete Song uses **§8a** (Song-level client `expectedVersion` + transactional cascade; Arr Versions bumped server-side; Arr concurrency tokens prevent silent overwrite). Resource hard-delete does not bump Arrangement Version (PERSISTENCE default).

#### Search

24. No tags. Future search: Title, Attribution, Label, DefaultKey.

### Rejected alternatives

| Alternative                                         | Why rejected                                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IsDefault` / “set default” API                     | No MVP workflow; Setlist/Event pick Arr explicitly; Labels + list UX suffice; adds ≤1 constraint, delete/reassign lifecycle, partial unique, concurrency across Arrs |
| `UNIQUE(GroupId, Title)`                            | False positives                                                                                                                                                      |
| Structured attribution / rights taxonomy            | Scope creep                                                                                                                                                          |
| Auto-create Default Arrangement as invariant        | Conflicts with zero-Arr ALLOW                                                                                                                                        |
| Leave Arrangements “live” under soft-deleted Song   | Orphan / AuthZ / library inconsistency                                                                                                                               |
| Require deleting all Arrangements before Song       | Hostile UX                                                                                                                                                           |
| Cascade-delete SetlistItems on Song/Arr soft-delete | Templates ≠ Events; destroys reusable plans unnecessarily                                                                                                            |
| Arrangement version history                         | Out of MVP                                                                                                                                                           |

### Consequences

- Persistence/API align to OriginKind, integer BPM, required Labels, duplicate titles ALLOWED, Song create without Arrangement, no `IsDefault`.
- Song soft-delete concurrency per §8a. Implementation of Song/Arrangement/Resource still requires **explicit** phase authorization.

### Explicitly deferred (FUTURE)

`IsDefault` / preferred Arrangement · Arrangement duplicate · version history · soft-delete restore · transposition · ChordPro · tags · global song catalog · decimal BPM · Song-level Resources

---

## ADR-0024 — Practice Resources and Part Metadata

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-15** (Phase 3.0.3 closure)
- **Date:** 2026-09-15
- **Depends on:** ADR-0007, 0008, 0017, 0018, 0023
- **Revises:** ADR-0017 §2 Resource purpose enum (adds `practice`; required Label; optional Part)
- **Does not supersede:** ADR-0008 (Resources stay Arrangement-scoped entities; no per-purpose subclasses)

### Context

Groups rehearse by listening to materials that teach a specific **musical part** (voice or instrument) or a full-ensemble guide. Examples: soprano/alto/tenor/baritone/bass guides, guitar guide, full rehearsal mix, instrumental, click, reference. Sonivo must support bands, choirs, ensembles, and cover groups **without** becoming choir-CMS or a DAW.

ADR-0008 already forbids polymorphic asset platforms and entity-per-purpose tables. ADR-0017 kept a **small** purpose enum and put backing/stem/instrumental under `audio` + note. That enum does not distinguish **“learn my part”** practice guides from general rehearse-along audio in a way that cleanly drives Arrangement UX sections.

### Decision (ACCEPTED)

1. **Resource remains the only materials concept** — child of Arrangement (ADR-0008 unchanged).
2. **No** `PracticeMaterial`, `VocalGuide`, or other specialized aggregates/subclasses in MVP.
3. **Purpose enum gains `practice`** (revises ADR-0017 six-value list → seven):

   | Purpose     | Use                                                                                        |
   | ----------- | ------------------------------------------------------------------------------------------ |
   | `chart`     | Notation / structure sheets                                                                |
   | `lyrics`    | Words-focused sheets                                                                       |
   | `audio`     | Other musical audio (instrumental/backing/mix stems as needed) — not part-learning primary |
   | `click`     | Click / metronome                                                                          |
   | `reference` | External example / original performance                                                    |
   | `practice`  | Part guides and full-ensemble rehearsal recordings intended for learning/practice          |
   | `other`     | Escape hatch + note                                                                        |

   Do **not** add top-level purposes such as `vocal-guide`, `backing-track`, `instrumental`, `slow-practice`, `harmony`, `rehearsal` — those distinctions belong in Label / Part / Note and UX.

4. **Kind remains** `file` \| `link`.
5. **Label (required):** user-facing display name (e.g. “Tenor Guide — Slow”); non-blank after trim.
6. **Part (optional string metadata):** free-text musical part name (e.g. `Tenor`, `Guitar 1`, `Lead`).
   - **Not** a first-class `Part` entity, catalog, or enum of voices/instruments.
   - `null` / empty = not part-specific (e.g. full rehearsal).
   - At most **one** Part string per Resource (no multi-part targeting).
   - Multiple Resources may share the same Part (distinguish via Label/Note).
   - **No** DB CHECK restricting Part to `practice` only — Part MAY appear on any purpose when meaningful; validate only non-blank-when-present and max length.
7. **Member → Part assignment is FUTURE** — Members choose materials manually.
8. **Event interaction unchanged (ADR-0017/0018):** EventSetlistItem does **not** reference ResourceIds; Resource availability on past Events remains **NOT GUARANTEED**; no Resource snapshots.
9. **Deletion unchanged (ADR-0017/0023):** Resource hard-delete; Arrangement soft-delete leaves Resource rows/blobs.
10. **Technical audio fields** (duration, waveform, BPM on Resource, format/sample-rate/bitrate/codec) are **not** domain MVP. Arrangement may already carry default BPM. Storage MIME/size/`ObjectKey` stay Infrastructure.

### Considered options (rejected)

| Option                                      | Why rejected                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| B — Separate `PracticeMaterials` collection | Duplicates Resource AuthZ/storage; contradicts ADR-0008 minimalism                                 |
| C — `VocalGuide` / per-purpose entities     | Choir-centric; type explosion (ADR-0008 rejected)                                                  |
| Keep only `audio` + Part without `practice` | Collides “full rehearsal”, “instrumental”, and part guides in one UX bucket; weak filters          |
| First-class `Part` aggregate + catalog      | Taxonomy product; hard-codes choir/instrument lists; custom parts still needed                     |
| Snapshot Resources onto Event               | Violates historical non-guarantee; storage/complexity; ADR-0017 forbids Resource versioning in MVP |
| CHECK Part only when Purpose=`practice`     | Unnecessary cross-field invariant; Part useful on other purposes when meaningful                   |

### Consequences

- Persistence (when Resource implementation is authorized): add Resource `Label` (required), `Part` (optional), extend Purpose CHECK to include `practice`.
- UX can group Arrangement materials as Practice / Charts / Lyrics / Backing audio / Click / Reference without new aggregates.
- Extensibility: custom parts are free text; FUTURE Part catalog or Member→Part assignment can be additive.

### Explicitly deferred (FUTURE)

Member→Part assignment · practice player (tempo/loop) · stems/mixer · Resource soft-delete undo · Resource history/snapshots · Song-level Resources · Event-scoped Resources · first-class Part registry

---

## ADR-0023 — Soft-delete visibility vs historical Event integrity

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 2.2 closure — **HUMAN-APPROVED**)
- **Date:** 2026-09-15 (Phase 2.2); **revised** Phase 2.2.1
- **Depends on:** ADR-0016, 0017, 0018

### Decision

1. Soft-delete uses `DeletedAt` on **Group**, **Song**, **Arrangement** only.
2. EF Core **global query filters** on those three types: `DeletedAt == null`.
3. **Event** uses `Status` / `CancelledAt` / `IsHidden` — not `DeletedAt`, not soft-delete filters.
4. **Event historical identity is filter-independent:** Event + EventSetlistItems load uses **copied display fields only** (`displaySongTitle`, `displayArrangementLabel`). Normal Event read path must **never** require `IgnoreQueryFilters()` and must **not** `Include` Arrangement/Song (no filtered required navigations that can drop items).
5. EF model: EventSetlistItem → Arrangement is **FK only** (no required navigation). Same preference for SetlistItem → Arrangement on template reads (load items without filtered Include).
6. Soft-deleted Arrangement/Song **rows remain**; EventSetlistItem FKs stay valid (**ON DELETE RESTRICT**).
7. On Arrangement soft-delete: **leave Resource rows and blobs in place** (inaccessible via normal Arr-scoped APIs). Explicit Resource hard-delete remains hard-delete. FUTURE blob/resource purge is **out of MVP**. Do **not** cascade-destroy Resources on Arr soft-delete.
8. `IgnoreQueryFilters` / “include deleted” is **Infrastructure-only**, behind narrow ports (e.g. materials availability / FUTURE restore). Application must not call `IgnoreQueryFilters` directly.

### Rejected

Soft-delete filter on Event/EventSetlistItem · required Arrangement navigation on Event load · unrestricted IgnoreQueryFilters · hard-delete Resources automatically on Arrangement soft-delete · soft-delete Resource entity in MVP

---

## ADR-0022 — Cross-Group referential integrity at persistence

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 2.2 closure — **HUMAN-APPROVED**)
- **Date:** 2026-09-15 (Phase 2.2); **revised** Phase 2.2.1
- **Depends on:** ADR-0019

### Decision

Application remains the **canonical** enforcer of tenancy (ADR-0019). Database composite FKs are **defense-in-depth**.

**Exact composite FK set:**

| Child → Parent                 | FK columns                                               | Principal unique key                   | ON DELETE    |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------- | ------------ |
| Arrangement → Song             | `(GroupId, SongId)` → `Songs(GroupId, Id)`               | `UNIQUE (GroupId, Id)` on Songs        | **RESTRICT** |
| SetlistItem → Arrangement      | `(GroupId, ArrangementId)` → `Arrangements(GroupId, Id)` | `UNIQUE (GroupId, Id)` on Arrangements | **RESTRICT** |
| EventSetlistItem → Arrangement | `(GroupId, ArrangementId)` → `Arrangements(GroupId, Id)` | same                                   | **RESTRICT** |

`UNIQUE (GroupId, Id)` exists **only** on Songs and Arrangements (required by these FKs).

Denormalized `GroupId` on SetlistItem and EventSetlistItem exists **for these FKs** (copied from parent Setlist/Event in Application).

**Simple FK only** (no composite): Resource→Arrangement, Setlist→Group, Event→Group, EventSetlistItem→Event, Membership→Group/User, RSVP→Event, Event→SourceSetlist (SET NULL).

Soft-delete leaves principal rows → composite FKs remain satisfied. Hard-delete of Arrangement is out of MVP.

Still **no** Postgres RLS.

### Rejected

Composite FKs on Resource/RSVP/Membership · UNIQUE(GroupId,Id) on every tenant table · RLS · treating composite FK as replacement for Application AuthZ

---

## ADR-0021 — Replace Event Plan from Setlist

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 2.1 closure — **HUMAN-APPROVED**)
- **Date:** 2026-09-15 (Phase 2.0); **revised** Phase 2.1
- **Depends on:** ADR-0016, 0018

### Problem

“Apply Setlist” can mean populate, sync, append, merge, or replace. Ambiguity causes silent data loss when Owners customize an Event plan then re-apply a template.

### Canonical semantic

**Replace Event Plan from Setlist** = one-shot **import/copy** that **replaces** the Event’s concrete plan with a new copy of the template. Not synchronization. Not a live link. Not merge.

Setlist = reusable template.  
EventSetlistItems = Event-owned plan (independent after copy).

### Decision

1. One DB transaction; no partial writes.
2. Validate: same Group; Event not cancelled; Setlist exists; every template Arrangement exists, same Group, **not** soft-deleted → else fail (400/409 listing blockers).
3. **Delete all** existing `EventSetlistItem` rows for that Event, then insert copies (order, ArrangementId, template overrides if any).
4. Copy `displaySongTitle` / `displayArrangementLabel` from **current** Song/Arrangement names at apply time (ADR-0018).
5. Set `sourceSetlistId` (provenance only).
6. Re-apply **allowed**; always full replace.
7. If the Event **already has one or more** EventSetlistItems, body must include `confirmReplace: true`; otherwise **409** with clear conflict (prevents accidental wipe). Empty plan may apply without the flag.
8. Route may remain `POST .../apply-setlist`; docs/UX must say **Replace Event Plan**.

### Scenario (binding expectation)

Template A,B,C applied → Owner reorders, edits overrides, removes B, adds D → template later changes → re-apply with confirmation → plan becomes **current template copy**; prior Event edits are **discarded**. Predictable; destructive; must be explicit in UX.

### Rejected

Append · silent skip of soft-deleted Arrangements · merge · live sync · reject-all re-apply · Setlist revision/version table for MVP

### Concurrency

Require Event `Version` / `expectedVersion` match (409 on conflict). No Setlist revision entity. Soft-delete race on Arrangement → fail apply. Concurrent dual apply → one wins via Event concurrency.

### Consequences

Hand-built / customized plans are wiped on confirmed replace. Historical integrity of **past** Events unchanged; this mutates the **current** Event plan only. Consistent with ADR-0015–0018 (copy-on-apply, tombstone labels, no live Setlist link).

---

## ADR-0020 — CSRF and cookie posture for same-site SPA

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 2.1 closure — **HUMAN-APPROVED**)
- **Date:** 2026-09-15 (Phase 2.0); **revised** Phase 2.1
- **Depends on:** ADR-0011

### Decision (one coherent MVP strategy)

**Double-submit antiforgery + SameSite Lax cookie session on a same-site SPA/API.**

| Rule         | Spec                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth cookie  | ASP.NET Identity application cookie: **HttpOnly**, **Secure** (non-dev), **SameSite=Lax**, dedicated name, `Path=/`                                                                              |
| Topology     | Dev: Vite proxy → API (browser origin = Vite). Prod: reverse proxy or API-hosted SPA so SPA and API are **same site** (preferably same origin)                                                   |
| CORS         | **No** credentialed cross-origin API access in MVP                                                                                                                                               |
| Antiforgery  | **ASP.NET Core supported antiforgery** (cookie + request token). Do **not** invent a custom CSRF token system; framework configuration is an implementation detail that must match this strategy |
| Bootstrap    | `GET /api/auth/csrf` (anonymous or authenticated) returns `{ "token": "..." }` and sets antiforgery cookie                                                                                       |
| SPA storage  | Keep token in **memory** (or short-lived module state); refresh via bootstrap after login; do not put auth cookie in JS                                                                          |
| Header       | `X-CSRF-TOKEN: <token>` on mutating requests                                                                                                                                                     |
| Methods      | **POST, PUT, PATCH, DELETE** when the request can authenticate via the auth cookie (including login/logout/register if those set or use cookies)                                                 |
| Safe methods | GET/HEAD/OPTIONS: **no** CSRF token (`/api/auth/me` included)                                                                                                                                    |
| Validation   | Framework compares header token to antiforgery cookie                                                                                                                                            |
| Failure      | **400** Problem Details (`csrf` / antiforgery) — do not proceed                                                                                                                                  |
| Origin check | Defense-in-depth: reject mutating requests whose `Origin`/`Referer` is present and not an allowed same-site origin                                                                               |

SameSite is defense-in-depth, **not** the sole CSRF defense.

### Login / logout

1. SPA calls `GET /api/auth/csrf` → token.
2. `POST /api/auth/login` with `X-CSRF-TOKEN` + credentials → auth cookie.
3. SPA calls `GET /api/auth/csrf` again (token may rotate).
4. `POST /api/auth/logout` requires auth cookie + CSRF token.

### Rejected

SameSite-alone as sole CSRF control · `SameSite=None` for MVP web · JWT-to-avoid-CSRF · custom CSRF framework · relying on CORS alone · storing CSRF token in localStorage as the primary design

### Consequences

SPA API client must attach `X-CSRF-TOKEN` on all unsafe methods. Misconfigured multi-origin prod without proxy breaks cookies/CSRF — hosting must preserve same-site topology.

---

## ADR-0019 — Group tenancy enforcement

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 2.1 closure — **HUMAN-APPROVED**)
- **Date:** 2026-09-15 (Phase 2.0); **revised** Phase 2.1
- **Depends on:** ADR-0005, 0012

### Principle (binding)

**CLIENT-SUPPLIED GROUP ID ≠ AUTHORIZATION.**  
Route `groupId` is a **claim to verify**, never a grant. Membership + role + scoped loads authorize.

### Canonical request flow

Authenticated User → Membership → Role → Scoped resource load → Cross-Group validation → Mutation/read.

### Decision

1. Group-scoped routes: `/api/groups/{groupId}/...`.
2. Every Group-scoped use-case: Authenticated User → load Membership `(userId, groupId)` → else **404** → then role AuthZ → else **403**.
3. Never trust Group headers/cookies as authority (UI selection is hint only).
4. Tenant repositories/queries for Group-owned entities **require** `(GroupId, EntityId)` (or equivalent filter). **Forbid** unscoped `GetById(entityId)` for tenant aggregates in Application paths.
5. Cross-Group references: when attaching A→B, load B with **same** `GroupId`; mismatch → **404/400**. FKs alone are **not** tenant isolation.
6. Denormalized `GroupId` on Song, Arrangement, Resource (via Arrangement), Setlist, Event, etc. is **required** for query isolation and cross-check without trusting joins alone.
7. Object keys: `groups/{groupId}/...`; AuthZ before signed URL/stream.
8. **No Postgres RLS** in MVP.
9. Soft-deleted Group: treat as inaccessible → **404**.

### 404 vs 403

| Case                                                                    | Status  |
| ----------------------------------------------------------------------- | ------- |
| Not authenticated                                                       | **401** |
| Authenticated, not a member (or Group soft-deleted / unknown to caller) | **404** |
| Member, insufficient role                                               | **403** |
| Member, resource missing in Group                                       | **404** |

### Rejected

Ambient current-Group cookie without per-request membership check · client GroupId without membership verification · RLS as MVP gate · treating FK presence as tenancy · unscoped entity-id lookups in use-cases

### Consequences

Frontend `/g/:groupId` mirrors routes; server re-checks every time. Security tests must prove IDOR failure for foreign `groupId` and cross-Group id swaps. Consistent with ADR-0005 / 0012 tenancy and roles.

---

## ADR-0018 — Historical Event identity (tombstones, not snapshots)

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 1 closure — **HUMAN-APPROVED**)
- **Depends on:** ADR-0016, ADR-0017
- **Revises:** ADR-0017 §4 “Song/Arrangement display titles MAY live” for **Event history display**
- **Does not** introduce content versioning.

### Problem

`ArrangementId` alone is insufficient for a human-readable past Event once Arrangements/Songs are soft-deleted or filtered out of normal library queries. Without a rule, agents invent full snapshots or broken “unknown item” UX.

### Distinction (binding intent)

| Tombstone identity                                            | Snapshot / versioning                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| “What item was this?” — labels to recognize the planned piece | “What did the whole Arrangement look like then?” — body, resources, charts |
| **In MVP**                                                    | **OUT OF SCOPE / rejected for MVP**                                        |

### Decision

Each **EventSetlistItem** stores:

1. Own identity (allows duplicates of the same Arrangement)
2. `ArrangementId` (FK; retained after soft-delete of Arrangement)
3. **Copied identity labels** captured at item create / Setlist apply time:
   - `displaySongTitle` (required string)
   - `displayArrangementLabel` (required string; may equal a default like `"Default"`)
4. Order + overrides (key/BPM/capo/notes) as already proposed
5. **Not** copied: lyrics, chords, structure, Resources, files, links

**Historical Event UI** renders plan lines from **copied labels** + overrides + unavailable state.  
**Live materials** (when Arrangement is not soft-deleted): Member may open the current Arrangement (live body/Resources).  
**Soft-deleted Arrangement/Song:** show tombstone using copied labels; materials unavailable; do not drop the EventSetlistItem row.

### Case matrix

| Case                                   | Display                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| A. Arrangement live                    | Labels from copies (stable plan); link to live Arrangement for materials |
| B. Arrangement soft-deleted, Song live | Tombstone: copied song title + arrangement label; materials unavailable  |
| C. Same as B (Song still present)      | Same — do **not** require live Song join for label                       |
| D. Song + Arrangement soft-deleted     | Same tombstone from copies; Event remains complete                       |
| E. Multiple Arrangements of one Song   | Distinct `displayArrangementLabel` values; each item’s own ArrangementId |
| F. Same Arrangement multiple times     | Multiple EventSetlistItems; same labels OK; distinct item ids/order      |

### Why not ArrangementId-only?

Soft-deleted entities are often invisible to default queries; UUID-only UX fails the “understandable history” bar. Copied **labels** are the smallest fix and are **not** content snapshots.

### sourceSetlistId (confirm)

Deleting Setlist template: EventSetlistItems unchanged; `sourceSetlistId` → **null**; Event plan intact. Templates remain acceleration only.

### Explicitly rejected

Arrangement/Resource/Setlist/Event content versioning · full Event snapshots · audit-history product · recordings/performance aggregates · ACL/chat/notifications/analytics/billing/org hierarchy

### Consistency note

ADR-0015 item “last Arrangement rejected” and live Setlist FK language are **superseded** by ADR-0016/0017/0018. Reading order for Phase 1 stack on conflicts: **0018 > 0017 > 0016 > 0015**.

---

## ADR-0017 — Phase 1.2 spine value, resource minimalism, historical contract

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 1 closure — **HUMAN-APPROVED**)
- **Depends on:** ADR-0015, ADR-0016
- **Revises:** portions of ADR-0016 listed below
- **Does not supersede** ACCEPTED ADRs 0005–0014.
- **Revised by:** ADR-0024 (**ACCEPTED** 2026-09-15) — purpose `practice`; required Label; optional Part metadata. Binding Resource purpose set is the **seven-value** list in ADR-0024. Historical contract, deletion, and Event non-guarantees in this ADR remain in force.

### Context

Phase 1.2 stress-tested whether the MVP is a recurring coordination loop, whether the Resource purpose enum is overbuilt, and whether historical Event integrity is coherent without versioning.

### 1. Spine — **SURVIVES with value reframing (ACCEPTED)**

**Smallest recurring problem:** Before the next rehearsal/performance, the group must agree **what pieces (which Arrangements)**, **in what order**, **with which one-off adjustments**, and Members must **find the current materials** and **confirm attendance**.

| Required for the loop                               | Supporting infrastructure                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Group, Membership, Owner/Member                     | Identity account                                                                                  |
| Arrangement (+ Song identity)                       | Progressive multi-Arrangement UI                                                                  |
| Resources on Arrangement (enough to open materials) | Rich purpose taxonomy                                                                             |
| Event + EventSetlistItems                           | Setlist **template** (accelerates reuse; not strictly required for a one-off Event built by hand) |
| Member view + RSVP                                  | Invite polish                                                                                     |

**Song → Arrangement → Setlist → Event** remains sufficient **if** Event + Member access are treated as part of the MVP proof — not optional polish after song CRUD.

**Setlist template** is valuable reuse, not the value itself. An Owner can build EventSetlistItems directly; templates are an optimization.

**Nothing missing that justifies MVP scope expansion** (no chat, tasks, casting, or versioning).

### 2. Q17 Resource purpose — **REVISED ADR-0016 enum (ACCEPTED)**

Challenge of prior eight values: `backing` / `stem` / `instrumental` are media-library subtypes that do not change MVP coordination behavior; they belong in the optional **note**.

**Minimum MVP purpose enum:**

| Value       | Scenario                                                    | Behavior impact                       |
| ----------- | ----------------------------------------------------------- | ------------------------------------- |
| `chart`     | Chord/structure sheet for players                           | Filter/find playable notation         |
| `lyrics`    | Words-focused sheet (vocalists)                             | Distinct prep from instrumental chart |
| `audio`     | Backing, stem, instrumental, mix — any rehearse-along audio | Find “something to play along to”     |
| `click`     | Click/metronome track                                       | Distinct from musical audio           |
| `reference` | YouTube/example performance link                            | External reference, not primary chart |
| `other`     | Escape hatch                                                | + note                                |

**Binding purpose set:** ADR-0024 (**ACCEPTED**) adds `practice` → seven values. Do **not** reintroduce `backing`/`stem`/`instrumental` as purposes.

**Rejected as first-class MVP purposes:** `backing`, `stem`, `instrumental` (use `audio` + note).  
Still: kind `file` \| `link`; optional note; strict enum validation.

### 3. Resource lifecycle — **CONFIRM hard delete; clarify history (ACCEPTED)**

EventSetlistItems reference **ArrangementId only** — **not** ResourceIds.

| Scenario                                | User sees                                                                         | History truthful?                                          |
| --------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A/B Resource deleted before/after Event | Arrangement materials list without that Resource; Event order/overrides unchanged | Yes for plan; **not** for “which files existed that night” |
| C Resource replaced                     | Current Resources only                                                            | Yes for plan; file lineage **NOT GUARANTEED**              |
| D Broken URL/file                       | Link/file may fail at open time                                                   | Availability **NOT GUARANTEED**                            |

**No** Resource snapshotting/versioning in MVP.  
**Hard delete** of Resource remains acceptable under this contract. Soft-delete Resource is **DEFERRED** (optional undo UX later), not required for history.

### 4. Historical Event contract — **ACCEPTED (explicit; labels per ADR-0018)**

Six months later, Sonivo promises:

| Category                                                                 | Classification                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| A. Event occurrence (time, type, status, location, notes)                | **MUST** stable                                                                                                    |
| B. Repertoire/order (EventSetlistItems: ArrangementId, order, overrides) | **MUST** stable                                                                                                    |
| C. Arrangement musical body at that time                                 | **NOT GUARANTEED** (live)                                                                                          |
| D. Resource availability/set at that time                                | **NOT GUARANTEED**                                                                                                 |
| E. Member RSVP history                                                   | **MUST** stable                                                                                                    |
| Soft-deleted Arrangement/Song on an item                                 | **MUST** keep row + **tombstone** display                                                                          |
| Song/Arrangement **library** titles when browsing live catalog           | **MAY** live                                                                                                       |
| Song/Arrangement labels on **past Event plan lines**                     | **MUST** use copied identity on EventSetlistItem — see **ADR-0018** (revises earlier “MAY live” for Event history) |

Intentionally imperfect MVP boundary: history = **what we planned**, not a forensic archive of charts/files.

### 5. Delete / retention — **mostly CONFIRM; two REVISIONS (ACCEPTED)**

| Entity           | Rule                               | Notes                                                                                  |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| Group            | Soft-delete                        | ACCEPTED intent ADR-0013                                                               |
| Song             | Soft-delete                        | Unchanged (ACCEPTED)                                                                   |
| Arrangement      | Soft-delete; Event items tombstone | Unchanged (ACCEPTED)                                                                   |
| Resource         | Hard-delete                        | Confirmed under §3                                                                     |
| Setlist template | Hard-delete OK                     | Event copies remain; on delete **null** `sourceSetlistId` on Events that pointed at it |
| Event            | `cancelled` + soft-hide            | Unchanged (ACCEPTED)                                                                   |

**Last Arrangement rule — REVISE ADR-0016:**

- Prior: blocked deleting last Arrangement.
- **ACCEPTED:** **ALLOW** Song with **zero** Arrangements.
- Meaning: Song is catalog identity; Arrangement is the playable unit. Zero Arrangements = incomplete Song (no status machine). Cannot place a Song on a Setlist/Event without an Arrangement.
- Creating a Song still creates a Default Arrangement (**ASSUMPTION**) — **REVISED by ADR-0025 ACCEPTED:** not a domain invariant; Song may be created with zero Arrangements.
- Soft-delete Song remains the way to retire identity + dependents.

### 6. Canonical value journey — **ACCEPTED**

**Prepare the next musical event**

- **Trigger:** Upcoming rehearsal/performance
- **Goal:** Shared plan + findable materials + attendance signal
- **Critical steps:** Ensure Arrangements/Resources exist → build/apply set order on Event → Members open materials → RSVP
- **Outcome:** Everyone works from the same plan and current materials
- **Recurring loop:** Next Event reuses Arrangements/templates; library accumulates

### Still unchanged from ADR-0016 (confirmed ACCEPTED via this package)

Q18 ALLOW duplicates · Q19 copy-on-apply · Q20 event types · Q21/Q22 FUTURE · no Arrangement versioning

### Consequences

**ACCEPTED** with 0015–0018: six-value Resource purpose enum; zero-Arrangement Songs allowed; null provenance on template delete; Event identity labels per ADR-0018; historical non-guarantees documented.

---

## ADR-0016 — Phase 1.1 edge cases (setlist/event history, Q17–Q22)

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 1 closure — **HUMAN-APPROVED**)
- **Depends on:** ADR-0007, 0008, 0013, 0014, 0015
- **Does not supersede** ACCEPTED ADRs 0005–0014.
- **Later revisions (also ACCEPTED):** ADR-0017 (Q17 enum, last-Arrangement, provenance nulling); ADR-0018 (Event identity labels). Unrevised clauses remain as written.

### Context

Unresolved Q17–Q22 and Event↔Setlist semantics would force schema/API invention at scaffold time.

### Spine (product)

Sonivo is **not** primarily a music library. The library is the **foundation** for coordinating rehearsal/performance. Recurring value is the weekly loop: current Arrangements → Setlist → Event → Members open the right materials.

MVP spine remains:

**Group → Song → Arrangement (+ Resources) → Setlist (template) → Event (occurrence + event setlist items) → Member view/RSVP**

### Q17 — Resource purpose → **RESOLVED (ACCEPTED; enum superseded by ADR-0017)**

- Kind: `file` | `link` (unchanged)
- Purpose: **strict enum** (domain-validated), not free-text taxonomy
- Optional free-text **note** for detail
- MVP enum: `chart` | `lyrics` | `backing` | `click` | `stem` | `instrumental` | `reference` | `other`
- Extensibility: product adds enum values later; `other` + note is the escape hatch

### Q18 — Duplicate Arrangements in one Setlist → **ACCEPTED: ALLOW**

- Same Arrangement may appear multiple times (reprise/encore/repeat)
- Identity is **SetlistItem** / **EventSetlistItem**, never unique(ArrangementId) per setlist

### Q19 — Setlist ↔ Event → **ACCEPTED: copy-on-apply (hybrid)**

| Concept                 | Role                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **Setlist**             | Reusable Group **template**; editable; may exist with no Event                        |
| **Event setlist items** | **Event-owned** ordered items (`EventSetlistItem`): ArrangementId + order + overrides |

- Applying a template to an Event **copies** items into the Event (not a live FK to the template)
- Optional `sourceSetlistId` on Event is **provenance only**, not a live join
- Later template edits do **not** rewrite past/future Events already copied
- No Arrangement content versioning in MVP

### Q20 — Event type → **ACCEPTED**

Strict enum: `rehearsal` | `performance` | `other`

- `recording_session`, `audition`: use `other` + notes (**DEFERRED** as first-class types)
- `service`: **OUT OF SCOPE** as a core type (ADR-0001); use `performance` or `other`

Also: Event lifecycle status `scheduled` | `cancelled` (**ACCEPTED**).

### Q21 — Duration / transitions → **FUTURE**

Not on SetlistItem/EventSetlistItem in MVP.

### Q22 — Arrangement status → **FUTURE**

No draft/ready/archived state machine in MVP. No setlist eligibility gating by status. Soft-delete covers removal from active use.

### Historical semantics (cross-cutting) → **ACCEPTED**

When opening an Event from months ago, the user must see:

| Stable (frozen on Event)                                              | Not frozen in MVP                                   |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| Event time, type, status, notes, location                             | Arrangement lyrics/chords body                      |
| EventSetlistItem order, ArrangementId, overrides (key/BPM/capo/notes) | Resource file bytes / link targets as they change   |
| Attendance/RSVP records                                               | Song title renames in **live library** (acceptable) |

**Phase 1.3 / ADR-0018:** Event plan lines use **copied** `displaySongTitle` + `displayArrangementLabel` (identity only). Soft-deleted Arrangement/Song → tombstone from those copies; do not drop rows.  
**Supersedes** “show current title” for **Event history** display.

### Delete / archive semantics → **ACCEPTED**

| Entity             | MVP semantics                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Group              | Soft-delete (ADR-0013)                                                                                                    |
| Song               | Soft-delete; Arrangements/Resources inaccessible with it                                                                  |
| Arrangement        | Soft-delete; Event items remain with tombstone (**last-Arrangement block superseded by ADR-0017 ALLOW zero**)             |
| Resource           | Hard-delete record (blob GC later); does not rewrite Event history                                                        |
| Setlist (template) | Hard-delete allowed (Events already hold copies); null `sourceSetlistId` (ADR-0017)                                       |
| Event              | Prefer `cancelled` + soft-hide; do not hard-delete as default past-Event action                                           |
| EventSetlistItem   | Hard-delete only while editing a non-historical draft Event; once Event is in the past, prefer leave items + cancel Event |

No universal soft-delete framework required — per-entity rules above.

### Canonical MVP workflow

1. User registers / signs in
2. Owner creates Group
3. Owner invites Member (Member joins)
4. Owner creates Song (Arrangement optional — ADR-0025; may create initial Arrangement in same product flow)
5. Owner attaches ≥1 Resource
6. Owner creates Setlist template; adds Arrangement item(s) (duplicates allowed)
7. Owner creates Event (`rehearsal` or `performance`)
8. Owner applies Setlist template to Event (copy) or builds Event items directly
9. Member views Arrangement materials + Event
10. Member RSVPs

This is the minimum loop that is more than song CRUD.

### Still OPEN / DEFERRED (not blockers for domain shape)

| ID                               | Status                          |
| -------------------------------- | ------------------------------- |
| Q8 chart format                  | OPEN                            |
| Q9 realtime                      | OPEN (lean no)                  |
| Q10 billing                      | OPEN                            |
| Q11 mobile/PWA                   | OPEN                            |
| Account-deletion product         | OPEN                            |
| Invite mechanics (email vs link) | DEFERRED to security/product UX |
| CSRF / hosting                   | Implementation design           |

### Consequences

**ACCEPTED:** Event model uses **EventSetlistItem** copies; live `Event.SetlistId` join is **rejected**. Binding with ADR-0017/0018 refinements.

---

## ADR-0015 — MVP domain specification clarifications (Phase 1.0)

- **Status:** **ACCEPTED**
- **Accepted:** 2026-09-15 (Phase 1 closure — **HUMAN-APPROVED**)
- **Date:** 2026-09-15
- **Depends on:** ADR-0005–0008, 0012–0014
- **Does not supersede** those ADRs; sharpens MVP behavior. Later Phase 1 ADRs 0016–0018 refine specific items (see reading order).

### Context

Phase 1.0 challenged product boundaries and Song/Arrangement/Setlist/Event/AuthZ before scaffold. Several rules were implied but not explicit enough to prevent agent invention.

### Proposed decisions

1. **Backbone:** Library-first **Song → Arrangement → Setlist → Event** remains the conceptual spine (Events support prep/delivery; they do not own musical truth).
2. **Setlist independence:** Setlist is Group-scoped and may exist without an Event. _(Event association: **copy-on-apply** into Event-owned items — ADR-0016; not a live Setlist FK.)_
3. **No cross-tenant repertoire links:** SetlistItem and Event must not reference Arrangements/Setlists from another Group.
4. **Arrangement immutability of lineage:** An Arrangement cannot move to another Song or Group after create.
5. **Last Arrangement:** ~~rejected~~ → **ALLOW zero Arrangements** (ADR-0017). ~~Create Song still creates Default Arrangement (assumption).~~ → **ADR-0025 ACCEPTED:** Song create does not require Arrangement.
6. **SetlistItem overrides (MVP floor):** order plus optional key, BPM, capo, notes. Duration/transitions FUTURE (ADR-0016).
7. **Resource purpose:** Strict enum — **six values in ADR-0017** (revises earlier open/exact list).
8. **Event type:** `rehearsal` \| `performance` \| `other` (ADR-0016/0017).
9. **Membership:** First-class domain association.
10. **Historical identity:** Copied display labels on EventSetlistItem (ADR-0018) — identity tombstones, not content snapshots.

### Explicitly still OPEN (do not invent in code)

Q8 chart format · account-deletion product flow

**Superseded as OPEN / revised by later Phase 1 ADRs:** Q17–Q22, Setlist↔Event, last-Arrangement, Event history labels (see 0016–0018).

### Reading order on conflicts (all ACCEPTED Phase 1)

**ADR-0018 > 0017 > 0016 > 0015**

### Consequences

DOMAIN-MODEL / CONTEXT Phase 1 sections are **binding FACT**. Do not reopen without a superseding ADR.

### Rejected in this ADR (scope)

Member musical content mutation · Event resources · Organization · Recording/Performance aggregates · polymorphic asset platform · generic PM/chat/social/DAW/distribution

---

## ADR-0014 — Arrangement aggregate boundary

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.5)
- **Depends on:** ADR-0007, ADR-0008

### Decision

- **Arrangement is its own aggregate root** with its own identity
- Arrangement references **SongId** and **GroupId** (tenant isolation)
- Arrangement owns mutable musical data and its **Resources**
- **SetlistItem** references **ArrangementId**
- Arrangement mutations do **not** require loading Song into the aggregate
- Cross-aggregate invariants (e.g. ≥1 arrangement, exactly one default) are enforced at the **application / domain-service** boundary
- Related mutations use an **explicit transaction** where required

### Core Arrangement data (subject to chart-format OPEN Q8)

- lyrics, chords, structure, default key, default BPM
- label / isDefault as needed

### Aggregate clarification (binding)

| Concept         | Meaning                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| **Song**        | Musical work / identity / attribution                                                  |
| **Arrangement** | Group-owned realization of that work                                                   |
| **Setlist**     | References Arrangements via SetlistItems                                               |
| **Resource**    | Belongs to Arrangement in MVP                                                          |
| **Event**       | Occurrence/context (e.g. rehearsal/performance); **not** a replacement for Arrangement |

### Out of MVP

- Recording / Performance aggregates
- Extra aggregates for every musical nuance

### Rejected

Arrangement as child entity inside Song aggregate only.

### Consequences

EF: Arrangements table with FKs; own concurrency. APIs may nest create under songs; updates by ArrangementId.

---

## ADR-0013 — Group ownership & lifecycle

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.5)
- **Depends on:** ADR-0005, ADR-0012

### Decision

| Rule                           | Binding                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Multiple Owners                | **Yes**                                                                                                   |
| Zero Owners while Group exists | **Forbidden**                                                                                             |
| Last Owner leave               | **Blocked**                                                                                               |
| Last Owner remove/demote self  | **Blocked**                                                                                               |
| Transfer ownership             | **Yes** — explicitly grant Owner role                                                                     |
| Owner remove another Owner     | **Yes** only if ≥1 Owner remains                                                                          |
| Member leave voluntarily       | **Yes**                                                                                                   |
| Owner remove Member            | **Yes**                                                                                                   |
| Empty Group (zero memberships) | **Forbidden**                                                                                             |
| Owners-only Group              | **Allowed**                                                                                               |
| Group deletion                 | **Allowed**; prefer **soft delete**                                                                       |
| After soft delete              | Group hidden; Songs, Arrangements, Setlists, Events, Resources **inaccessible** via normal tenant access  |
| Object-storage GC              | **Future** operational concern                                                                            |
| Account-deletion product       | **Not designed** in this ADR (sole-owner constraint still applies as domain intent when that flow exists) |

### Rejected

Single-owner-only model; hard-delete-only as MVP default.

---

## ADR-0012 — Roles & authorization

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.5)
- **Depends on:** ADR-0005, ADR-0006

### Decision

MVP roles are exactly:

- **Owner**
- **Member**

**Do not** create an Organizer role.

| Persona         | Typical role |
| --------------- | ------------ |
| Group Organizer | Owner        |
| Member          | Member       |

Authorization is **role-based only** for MVP.

### Distinctions (binding)

| Concern              | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| **Authentication**   | Who is the User? (Identity — ADR-0009)                            |
| **Authorization**    | What may this membership do in a Group? (this ADR)                |
| **Tenant isolation** | GroupId scoping (ADR-0005)                                        |
| **Domain ownership** | e.g. Resource → Arrangement → Group — not user-owned files in MVP |

### Permission matrix

| Action                                                    | Owner | Member |
| --------------------------------------------------------- | ----- | ------ |
| View songs / arrangements / resources / setlists / events | Y     | Y      |
| RSVP (where applicable)                                   | Y     | Y      |
| Manage membership / invite / remove                       | Y     | N      |
| Modify Group settings                                     | Y     | N      |
| Create/update/delete Songs                                | Y     | N      |
| Create/update/delete Arrangements                         | Y     | N      |
| Create/update/delete Resources                            | Y     | N      |
| Create/update/delete Setlists                             | Y     | N      |
| Manage Events                                             | Y     | N      |
| Transfer ownership                                        | Y     | N      |
| Delete Group                                              | Y     | N      |
| Leave Group                                               | Y\*   | Y      |

\*Owner leave only if not the last Owner (ADR-0013).

**Member cannot mutate core Group content in MVP.**

### Forbidden in MVP

Per-resource ACL · granular permission entities · permission tables · policy engines · complex RBAC abstractions · `guest` role · separate `organizer` role

### Rejected

Three-role `owner|organizer|member` for MVP (defer until needed).

---

## ADR-0011 — Session strategy

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.5)
- **Depends on:** ADR-0009, ADR-0010

### Decision

- Secure **HTTP-only** ASP.NET Core Identity **application cookie** for the **web MVP**
- **Same-site** SPA + API deployment (API remains a first-class boundary; browser authenticates via cookie)
- **Vite dev proxy** for local development
- **HttpOnly** cookies; **Secure** in production
- **SameSite** appropriate to same-site deployment
- **Explicit CSRF** strategy must be defined during implementation / security design
- **Server-side logout**
- **Do not** use JWT access + refresh for the web MVP
- **Do not** introduce a separate BFF architectural layer
- Future mobile/native **bearer** auth is an **additive future ADR**

### Clarification

This does **not** mean “Sonivo has no API.” The ASP.NET Core API is first-class; the browser authenticates to it with the application cookie.

### Rejected

BFF-as-layer for MVP · JWT+refresh as web MVP auth · dual cookie+JWT for web MVP

---

## ADR-0010 — Technology stack

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.3)
- **Supersedes:** Phase 0 assumption “TypeScript across the stack”

### Decision

Minimum sufficient stack for Sonivo SaaS:

| Layer                  | Choice                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| Frontend (product app) | React + TypeScript + Vite + Tailwind CSS                            |
| Backend                | ASP.NET Core modular monolith                                       |
| Persistence access     | Entity Framework Core                                               |
| Database               | PostgreSQL (managed)                                                |
| Object storage         | S3-compatible **or** Azure Blob–style via abstraction               |
| Auth platform          | ASP.NET Core Identity (see ADR-0009) — **not** Supabase-as-platform |

### Architectural principles (binding)

- Modular monolith (ADR-0003)
- No microservices, event sourcing, or CQRS unless a future ACCEPTED ADR justifies them
- Do **not** introduce Next.js merely for SSR/SEO of the authenticated app
- Marketing-site rendering strategy, if needed later, is a **separate** concern/ADR
- Do **not** make Supabase the application platform by default

### Rejected alternatives

| Rejected                                           | Why                                                          |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Next.js as product shell with .NET API             | Extra complexity without MVP need                            |
| Next.js full-stack replacing .NET                  | Rejects intentional .NET domain host                         |
| Blazor primary UI                                  | React + design-skill ecosystem preferred for this product UI |
| Supabase-as-platform (Auth+DB+Storage as app core) | Conflicts with Identity + portable storage abstraction       |
| Microservices / ES / CQRS                          | Premature                                                    |

### Consequences

Dual toolchain (Node for SPA + .NET API). OpenAPI contract is critical. Hosting provider still OPEN.

---

## ADR-0009 — Authentication

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.3)
- **Condition:** Valid with ADR-0010 (.NET stack)

### Decision

- **ASP.NET Core Identity** is the **single** authentication system for MVP
- Initial mechanism: **email/password**
- Include **email verification** and **password reset**
- External/social providers may be added **later** only via Identity external authentication
- **Do not** use Supabase Auth
- **Do not** use Clerk + Identity or any dual-IdP hybrid
- **Authorization** (Group roles/permissions) remains an application/domain concern

### Session (resolved)

- **ADR-0011 ACCEPTED:** HTTP-only Identity application cookie; same-site SPA+API; CSRF to be defined at implementation/security design.

### Related ACCEPTED

- Roles: ADR-0012 · Group lifecycle: ADR-0013

### Rejected alternatives

| Rejected                                           | Why                                                      |
| -------------------------------------------------- | -------------------------------------------------------- |
| Supabase Auth                                      | Wrong platform coupling with ACCEPTED stack              |
| External OIDC-only (Clerk/Auth0) as sole MVP IdP   | Extra vendor; Identity sufficient for email/password MVP |
| Identity **and** separate OIDC product in parallel | Two sources of truth                                     |

### Consequences

AuthN implemented in ASP.NET; App User mapped to domain User; invites/membership are AuthZ, not a second IdP.

---

## ADR-0008 — Resources

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.3)

### Decision

- MVP **Resource belongs to Arrangement** only
- Resource kinds: **`file`** | **`external link`**
- **Purpose** is metadata/label (e.g. backing, click, stem, chart, reference) — **not** separate domain entity types
- No specialized resource subclasses/tables per media type in MVP
- No generic polymorphic attachment infrastructure in MVP
- **Event resources are FUTURE** and must remain **additive**

### Out of MVP (intentional)

- Resources on Song, Event, Project, Recording, Performance
- Stem-mixer domain objects
- Per-type resource aggregates

### Rejected alternatives

| Rejected                                         | Why                                   |
| ------------------------------------------------ | ------------------------------------- |
| Polymorphic Arrangement\|Event parents in MVP    | Premature abstraction                 |
| Song-only files                                  | Breaks multi-arrangement audio/charts |
| Entity-per-purpose (BackingTrack, ClickTrack, …) | Type explosion                        |

### Consequences

Requires Arrangement existence (ADR-0007). AuthZ via Arrangement → Song → Group.

---

## ADR-0007 — Song and Arrangement

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.3)

### Decision

- **Song** = musical work identity / attribution (title, original vs cover, etc.)
- **Arrangement** = group/project-specific musical realization
- **Arrangement owns:** lyrics, chords, structure, default key, default BPM
- ~~Creating a Song creates a **Default Arrangement**~~ → **REVISED by ADR-0025 ACCEPTED:** Song create does **not** require an Arrangement; zero Arrangements ALLOWED (ADR-0017). Convenience “Song + initial Arrangement” may exist as an Application use-case only.
- **SetlistItem** references an **Arrangement**
- **SetlistItem** may hold execution-specific overrides (e.g. one-off key) where appropriate
- UI may progressively disclose Arrangement when only one exists (**count-based**; no `IsDefault` — ADR-0025)

### Intentional OUT OF MVP (do not invent as aggregates)

| Concept                            | MVP treatment                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| **Recording** (release artifact)   | Not an aggregate — use audio **Resource** on Arrangement if needed                    |
| **Performance** (as work entity)   | Not an aggregate — use **Event** with type `performance`                              |
| Album / EP / release Project       | FUTURE                                                                                |
| Every transpose as new Arrangement | Prefer SetlistItem override for one-offs; new Arrangement only for lasting divergence |

### Keep distinct

Song ≠ Arrangement ≠ Setlist ≠ Event.

### Rejected alternatives

| Rejected                                | Why                                                             |
| --------------------------------------- | --------------------------------------------------------------- |
| Flat Song only                          | Costly migration when lasting multi-version charts/audio appear |
| Setlist → Song only                     | Ambiguous which charts/audio apply                              |
| Recording/Performance aggregates in MVP | Premature                                                       |

### Aggregate boundary (resolved)

- **ADR-0014 ACCEPTED:** Arrangement is a separate aggregate root.

### Still OPEN

- **Q8:** Chart format (text / ChordPro / PDF / hybrid) — remain OPEN

### Consequences

Domain and APIs must not collapse Arrangement into Song. Resources hang off Arrangement (0008).

---

## ADR-0006 — Primary persona

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.3)

### Decision

- **Primary persona:** Group Organizer (acquisition, IA, admin, content creation)
- **Secondary persona:** Member
- **Guest:** provisional — **not** a required full MVP capability
- Member **read/use** experience must be **first-class** (retention); do **not** design Sonivo as an admin dashboard where musicians are an afterthought

### Rejected alternatives

| Rejected                    | Why                                   |
| --------------------------- | ------------------------------------- |
| Member-first product        | Empty libraries; weak paid/admin loop |
| Worship-leader-only framing | Violates ADR-0001 positioning         |
| Guest-required MVP          | Scope expansion without validation    |

### Consequences

Empty states and permissions design optimize Organizer activation; rehearsal-time paths optimize Member speed-to-chart/audio.

---

## ADR-0005 — User → Group tenancy

- **Status:** ACCEPTED
- **Accepted:** 2026-09-15 (Phase 0.3)

### Decision

- A **User** may belong to **multiple Groups**
- **Group** is the MVP **tenant / data-isolation** boundary
- **Membership** is scoped to Group
- **Invitations** are scoped to Group
- **Do not** introduce **Workspace** or **Organization** in MVP
- Preserve a **future** migration path toward Organization **without designing** Organization now (e.g. later nullable parent FK while Group remains isolation boundary)

### Ownership lifecycle (resolved)

- **ADR-0013 ACCEPTED** (multi-owner, last-owner rules, soft-delete).
- **ADR-0012 ACCEPTED** (Owner | Member roles).

### Still OPEN

- Full account-deletion product flow (not designed; sole-owner constraint is domain intent)

### Rejected alternatives

| Rejected                         | Why                               |
| -------------------------------- | --------------------------------- |
| Workspace → Group nesting in MVP | Extra noun; little MVP value      |
| Organization → Group in MVP      | Theoretical scalability only      |
| Single-group-only users          | Unrealistic for working musicians |

### Consequences

All tenant data keyed by `GroupId`; storage prefixes under group; AuthZ is membership-in-group. Prefer term **Group** over Workspace in product language.

---

## ADR-0004 — Documentation information architecture

- **Status:** ACCEPTED
- **Date:** 2026-09-15

Root `README.md` + `AGENTS.md`; docs under `docs/00-context` … `03-architecture` + `tooling`. Defer empty `04-design` / `05-security` / `06-development`.

---

## ADR-0003 — Modular monolith

- **Status:** ACCEPTED (directional)
- **Date:** 2026-09-15

Single deployable backend with domain modules; Postgres SoR; object storage for files. No microservices/CQRS/event sourcing without a future ADR.

---

## ADR-0002 — Process tooling preference

- **Status:** **ACCEPTED**
- **Date:** 2026-09-15
- **Accepted in:** Phase 0.8 (tooling prune & ratification)

**Policy (binding):**

- **CORE (project-local):** `grill-with-docs`, `domain-modeling`, `to-spec`, `to-tickets`, `tdd`, `implement`, `code-review`, `diagnosing-bugs`, `codebase-design`
- **SPECIALIZED (project-local; task-gated):** `impeccable`, `grilling`, `prototype`, `research`, `resolving-merge-conflicts`
- **DEFERRED:** `setup-matt-pocock-skills`, `handoff`, `product-marketing`, Context7, surplus Matt skills — do not install/configure/invoke/depend
- **REJECTED:** `wayfinder`, `git-guardrails-claude-code`, `migrate-to-shoehorn`, `scaffold-exercises`
- **Removed from project-local (0.8):** surplus Matt skills, `product-marketing`, Graphify project rule + `graphify-out/`, watermarks project rule
- **Not Sonivo deps:** user-global Taste/Emil; user-global Graphify CLI; Context7; watermarks-remover global install/service

Skills support repository process (`docs/`, ADRs, TDD); they do not replace it.

---

## ADR-0001 — Multi-segment positioning

- **Status:** ACCEPTED
- **Date:** 2026-09-15

Sonivo is not church-first; worship is a supported segment. Core language stays generic (`Event`, not `Service` as core type).

---

## Index

| ADR  | Title                                           | Status       |
| ---- | ----------------------------------------------- | ------------ |
| 0001 | Positioning                                     | ACCEPTED     |
| 0002 | Process tooling                                 | **ACCEPTED** |
| 0003 | Modular monolith                                | ACCEPTED     |
| 0004 | Docs IA                                         | ACCEPTED     |
| 0005 | Group tenancy                                   | **ACCEPTED** |
| 0006 | Primary persona                                 | **ACCEPTED** |
| 0007 | Song/Arrangement                                | **ACCEPTED** |
| 0008 | Resources                                       | **ACCEPTED** |
| 0009 | Authentication                                  | **ACCEPTED** |
| 0010 | Stack                                           | **ACCEPTED** |
| 0011 | Session strategy                                | **ACCEPTED** |
| 0012 | Roles / AuthZ                                   | **ACCEPTED** |
| 0013 | Ownership lifecycle                             | **ACCEPTED** |
| 0014 | Arrangement aggregate                           | **ACCEPTED** |
| 0015 | MVP domain spec clarifications                  | **ACCEPTED** |
| 0016 | Phase 1.1 edge cases (Q17–Q22, history)         | **ACCEPTED** |
| 0017 | Phase 1.2 spine/resources/history revisions     | **ACCEPTED** |
| 0018 | Historical Event identity (tombstones)          | **ACCEPTED** |
| 0019 | Group tenancy enforcement                       | **ACCEPTED** |
| 0020 | CSRF + cookie posture (SPA)                     | **ACCEPTED** |
| 0021 | Replace Event Plan from Setlist                 | **ACCEPTED** |
| 0022 | Cross-Group referential integrity (persistence) | **ACCEPTED** |
| 0023 | Soft-delete filters vs Event history            | **ACCEPTED** |
