# Phase UI/UX polish (ADR-0043 follow-up)

**Status:** **SHIPPED / CLOSED 2026-09-30** — all four waves merged with green CI.
**Scope owner:** ADR-0043 (ACCEPTED). This phase fixed defects **inside** that accepted scope; it added no new product scope.
**Method:** every wave was implemented by a delegated builder, then audited (build + oxlint + the full Playwright suite + a manual browser pass via the Playwright MCP), merged only on green CI, branch deleted.
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

| Wave | Fixes | PR | Local E2E |
| ---- | ----- | -- | --------- |
| **W6** (P0) | Light theme actually implemented | #122 | 47/47 |
| **W7** (P1) | Hierarchy, duplication, plurals | #123 | 48/48 |
| **W8** (P2) | Practice render + separated destructive actions | #126 | 49/49 |
| **W9** (P3) | Outside surfaces + labelled appearance controls | #154 | 53/53 |

Auditor fixes made during review (each caught because the full suite runs per wave):

- W6: the i18n scaffold auto-detected English from `navigator.language`, breaking two group journeys → es-only default.
- W7: the role line, the "Tu rol en este grupo:" label and the group-name heading are asserted by existing specs, so they were kept (name as an `sr-only` heading) instead of being silently dropped.
- W9: the group row's accessible name had grown to include the role text, breaking RSVP's exact-name lookup → `aria-label` is now the group name with the role exposed via `aria-describedby`.
- W8: none needed.

Two defects were verified as **not** bugs rather than "fixed": no horizontal overflow at 390px (the clipped mobile label was a full-page screenshot artifact), and a suspected green outline around a panel was a capture artifact (computed styles clean).

## Explicitly not in scope

Native app (Q11 FUTURE) · backend i18n · scoring (ADR-0037) · new product surfaces · visual redesign of the accepted direction (ADR-0043 stands).

## Verification

Each wave: `npm run build`, `oxlint`, the full Playwright critical-journey suite against the real React → API → Identity cookie → PostgreSQL path, plus the Impeccable detector on the touched UI. Local baseline at program start: **46/46**.
