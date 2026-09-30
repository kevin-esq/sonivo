# Phase UI/UX polish (ADR-0043 follow-up)

**Status:** IN PROGRESS — defect-remediation program opened 2026-09-30 after a manual MCP browser audit of the shipped redesign.
**Scope owner:** ADR-0043 (ACCEPTED). This phase fixes defects **inside** that accepted scope; it adds no new product scope.
**Method:** every wave is implemented by a delegated builder, then audited (build + oxlint + full Playwright suite + Impeccable detector), merged only on green CI, branch deleted.
**Depends on:** ADR-0043, 0006, 0037, 0042.

---

## Why: findings from the manual browser audit

A full click-through of every surface (auth, groups, library, song/arrangement, practice, setlists, events, people, group settings, account, both themes, mobile 390px, 404) produced 36 screenshots and these findings, ordered by severity.

### P0 — Light theme declared but not implemented

The theme toggle ships, but the light theme is unreadable. Measured in code: **zero** components use the light tokens (`bg-surface`, `text-ink`, `text-muted`, `bg-shell`), while ~100 utilities are hard-coded for the dark shell (`text-white`, `text-slate-300/400`, `border-white/10`, `bg-neutral-dark`, `text-neutral-light`). Observed in light mode: the brand lockup, account email, sign-out link, page titles and the active account tab all render white-on-light. Highest-hit files: `GroupWorkspace` (20), `PersistentGlobalPlayer` (17), `TwoFactorSection` (15), `SetlistListPage` (13), `EventListPage` (11), `LibraryPage` (10), `UserChrome` (9).

### P1 — Hierarchy and consistency

- The group bar and the content card are inset differently, and every group page stacks **two** gradients (group bar + page hero), competing for hierarchy.
- Duplicated facts: group name/role repeated in the group header and again in the page body; song hero chips "0 arreglos" + "Sin arreglo" plus the sidebar "Arreglos 0 arreglos"; list/event counters in both hero and sidebar.
- Contradiction: Inicio offers a working "Renombrar grupo" while Ajustes states renaming "arrives in a later wave".
- Pluralisation/casing: "1 arreglos", "2 Canciones" vs "2 canciones".

### P2 — Practice and destructive actions

- ChordPro directives leak into the lyric render (`{title: …}` shows as the line "TÍTULO: …").
- The "Avanzado" tab contains no tools, only two links back to the arrangement.
- Destructive actions sit next to benign ones with no separation: "Eliminar grupo" inside the admin column, "Eliminar canción/arreglo" beside "Editar", and a red "Cancelar evento" in the event hero.

### P3 — Surfaces left outside the redesign, and a11y

- `/` (My groups) still uses the old dark canvas + small card with a bare empty state; the auth screens keep a large empty dark panel; the 404 page renders unstyled inline CSS with no brand.
- Accent swatches and cover chips carry no labels; cover gradient names are English tokens ("violet/ocean/forest/sunset") inside a Spanish UI; there is no "no cover" option.

---

## Waves

| Wave | Fixes | Deliverable |
| ---- | ----- | ----------- |
| **W6** (P0) | Light theme actually implemented | Token-based shell chrome; new E2E asserting WCAG AA contrast in both themes |
| **W7** (P1) | Hierarchy, duplication, pluralisation | One header per screen, single source per fact, correct plural/casing |
| **W8** (P2) | Practice + destructive affordances | Clean ChordPro render, honest Avanzado tab, separated destructive actions with confirmation |
| **W9** (P3) | Outside surfaces + a11y labels | `/`, auth and 404 in the design system; labelled swatches, translated gradient names, "no cover" option |

## Explicitly not in scope

Native app (Q11 FUTURE) · backend i18n · scoring (ADR-0037) · new product surfaces · visual redesign of the accepted direction (ADR-0043 stands).

## Verification

Each wave: `npm run build`, `oxlint`, the full Playwright critical-journey suite against the real React → API → Identity cookie → PostgreSQL path, plus the Impeccable detector on the touched UI. Local baseline at program start: **46/46**.
