# UI/UX audit 2026-09 — evidence, heuristics and refactor plan

**Status:** audit **COMPLETE** — findings and plan ready for the owner's prioritisation. Fixes are not started (see "Plan" for sequencing).
**Scope:** the shipped web app (ADR-0043 redesign + the W6–W10 polish waves) at `develop`.
**Method:** reproducible — every number below comes from the harness in [`e2e/visual-audit`](../../e2e/visual-audit/README.md) or from a measured computation in the page, never from impression.

---

## 1. How the evidence was produced

| Layer | Tool | What it gives |
| ----- | ---- | ------------- |
| Automated WCAG | `@axe-core/playwright` (WCAG 2.0/2.1/2.2 A+AA rule sets) | violations by impact, offending selectors, failure summaries |
| Layout metrics | harness `collectMetrics()` | horizontal overflow + offenders, interactive targets under 44px, heading outline, gradient surfaces |
| Capture | Playwright | full-page + viewport PNG per screen, three viewports |
| Design-system drift | `impeccable detect --json` | deterministic implementation-integrity findings |
| Visual judgement | manual pass over the captures | hierarchy, consistency, feedback, copy |

**Coverage: 34 flows × 3 viewports = 102 screens, 203 screenshots** (desktop 1440×900, tablet 834×1112, mobile 390×844 touch). Flows include auth (empty/filled/error/confirmation), groups, library (empty/with data/no-results/modal), song, arrangement, resources, practice ×3 tabs, setlists, events, people, invite, group settings, account ×3, 404, light theme, and keyboard-focus states.

Deterministic detector result on `web/sonivo-web/src`: **no findings** (`[]`) — the issues below are contrast, target-size and content/hierarchy issues, not shortcut markers.

---

## 2. Findings

### 2.1 ALTA — the brand palette fails WCAG AA contrast (root cause of ~90% of violations)

| Token pair | Measured | AA (4.5:1) |
| ---------- | -------- | ---------- |
| `--color-primary` `#8366f1` as **text** on white surface | **4.09:1** | FAILS |
| `--color-primary-foreground` `#f8fafc` on a **primary button** (`#8366f1`) | **3.91:1** | FAILS |
| `--color-error` `#ef4444` as **text** on white | **3.76:1** | FAILS |
| White text on an **error/danger button** (`#ef4444`) | **3.76:1** | FAILS |
| `--color-muted` `#64748b` on white | 4.76:1 | passes |
| `--color-shell-link` light `#6d4ee0` on white (added in W6) | 5.50:1 | passes |

Axe reports **128 color-contrast nodes on desktop** (126 tablet, 117 mobile) across **31 of 34 screens**. Aggregated offenders: `.bg-primary` (16 screens — every primary button), `text-primary` links (18 occurrences), the danger buttons inside `.border-error/40`, `a[href$="register"]`, `a[href$="forgot-password"]`, and small uppercase labels.

**Why it matters:** primary CTAs and links are the app's main affordances; purple-on-white is the brand's signature. This is a **design-token** defect, not a per-screen bug — it is fixed once, in the token layer.

**Precedent in-repo:** W6 already solved the same problem for the shell by introducing a dedicated `shell-link` token that passes (5.50:1) instead of reusing the decorative secondary. The same pattern applies here.

### 2.2 ALTA — interactive targets below the 44px guidance, systemically

29–31 of 34 screens contain at least one interactive element under 44px on at least one axis. Most repeated:

| Element | Measured | Where |
| ------- | -------- | ----- |
| `a[Sonivo]` (brand lockup link) | 199×32 | every header |
| `a[Mis grupos]`, rail nav links | 199×20, 68×20 | rail |
| `button[Cerrar sesión]` (rail footer) | **98×16** | rail footer |
| `button[Mostrar]` (password reveal) | 52×20 | auth |
| `a[Gracias]`, `a[Versión acústica]` (list rows) | 51×20 | library |

Axe additionally raises **`target-size`** on the auth screens: the password-reveal control measures **52.5×20** inside an absolutely-positioned wrapper (below the 24px minimum).

**Why it matters:** the member persona is mobile-first (ADR-0006), and these are the controls a phone user taps most.

### 2.3 MEDIA — "Miembros" is unreachable on mobile

`mobile-tabbar` exposes only 4 destinations (Inicio, Listas, Eventos, Biblioteca) and the account drawer was removed in W1. Nothing in the mobile chrome links to `/groups/:id/people`, so managing people/roles is impossible at phone width. The audit harness surfaced this as a hard navigation gap (`people-roster` cannot be reached at 390px).

### 2.4 MEDIA — feedback for asynchronous work is thin

- Loading is represented by a skeleton on list pages (`ListSkeleton`/`PageSkeleton`) but **not consistently**: the rail shows a pulse placeholder only while the group loads; route-level async pages rely on `Suspense` fallbacks that read as a bare "Cargando…" screen.
- Async mutations (invite, apply setlist, upload) disable their button but show no in-place progress or optimistic state; confirmation is a one-line `aria-live` message that is easy to miss.
- No micro-interaction acknowledges a successful save beyond a text line.

### 2.5 MEDIA — copy that leaks internal vocabulary

- The event hero exposes the internal `expectedVersion` as a visible "v2" badge (was removed in W7 from the subtitle; verify it stays gone).
- `Ajustes del grupo` still says the logo is "un marcador de posición" and mentions "próxima oleada" — that is release-planning language, not user language.
- `Mi asistencia: Sin respuesta` reads as a system state; "Aún no confirmaste tu asistencia" is clearer.
- `Próximo evento` / `Listas recientes` are fine; the mixed-language leftovers found earlier are resolved.

### 2.6 MEDIA — the mobile account tab strip hides destinations

`/cuenta` renders its 4 sections in an `overflow-x-auto` strip. At 390px the strip overflows (measured: content wider than the viewport inside the scroller) with **no visible scroll affordance**, so "Seguridad" and "Mis grupos" can be off-screen with nothing indicating they exist. Note: this is **internal** scroll, not page overflow — the document itself does not scroll horizontally on any screen (0 page-level overflow on all three viewports).

### 2.7 BAJA — hierarchy and density nits

- The group bar keeps a `Sin portada` neutral tile by default; without a cover the hero reads as a plain block. Consider a subtle accent wash as the default.
- Stat tiles on the group home are large and mostly empty on desktop; they could carry a trend or a next-action hint.
- Long single-column forms (group admin: invite, rename, danger) could use a two-column layout on desktop to cut scroll length.
- `Pista de ensayo · 0:02 / 0:03` in the rail card is fine, but the progress bar is only ~90px wide — consider a hover-revealed wider scrubber.

### 2.8 Verified NOT defects (avoided false positives)

- **No page-level horizontal overflow** on any of the 102 screens (`scrollWidth == clientWidth`). Two mobile screens were initially flagged; inspection shows the offending element sits inside the account tab strip's intentional `overflow-x-auto`, so it is 2.6, not an overflow bug.
- A suspected "green outline" around a home panel was a capture artifact — computed styles are clean.
- The captured screenshots include a `bit-notification-bar-root` overlay injected by a browser extension on the audit machine; it is **not** part of the app and was filtered before interaction.

---

## 3. Nielsen heuristic evaluation

| # | Heuristic | Verdict | Evidence |
| - | --------- | ------- | -------- |
| 1 | Visibility of system status | **Partial** | skeletons on lists, `aria-live` for counts/RSVP; but async mutations and route loads are silent or generic (2.4) |
| 2 | Match between system and the real world | **Good** | domain vocabulary (Listas, Arreglos, Ensayo, Tocada) is used consistently after W7/W9 |
| 3 | User control and freedom | **Good** | destructive actions separated with confirmations (W8/W9), collapse/expand persisted, Esc closes the player |
| 4 | Consistency and standards | **Good** | single header per screen, shared chips/plurals, one audio element and one transport per viewport (W7–W10) |
| 5 | Error prevention | **Good** | `expectedVersion` conflicts surfaced, confirm dialogs on destructive paths, validation messages inline |
| 6 | Recognition rather than recall | **Partial** | icons-only rail in collapsed mode keeps names via tooltips/aria, but the mobile tab strip hides destinations with no cue (2.6) |
| 7 | Flexibility and efficiency | **Partial** | keyboard focus visible everywhere; no shortcuts, no bulk actions, no view density control |
| 8 | Aesthetic and minimalist design | **Good** | duplicated facts removed (W7); residual nits in 2.7 |
| 9 | Help users recognise and recover from errors | **Partial** | error states exist and are announced, but the 404/error fallbacks offer a single "back home" action; the login error does not say which field failed |
| 10 | Help and documentation | **Weak** | no in-product help, no contextual explanations of concepts like "Plan aplicado" vs "Borrador" beyond a short subtitle |

---

## 4. Plan — step-by-step refactor

Each step is a self-contained slice with its own verification, in the order that maximises effect per unit of risk. Steps 1–2 are pure token/layout work and are the highest-leverage changes in the whole program.

### Step 1 — Fix the palette at the token layer (ALTA, ~128 violations in one change)
1. Add contrast-safe **on-surface** variants: `--color-primary-ink` (for text/icons on light surfaces, target ≥4.5:1 on white and ≥4.5:1 on the dark canvas) and `--color-primary-strong` (solid button fill that keeps white text ≥4.5:1).
2. Do the same for `error`: an `error-ink` for text and an `error-strong` for destructive fills.
3. Migrate usages: `text-primary` on light surfaces → `text-primary-ink`; solid `.bg-primary` buttons → `bg-primary-strong`; danger buttons → `bg-error-strong`. Keep the decorative brand purple for fills that carry no text.
4. **Verification gate:** extend the W6 contrast spec to assert the button and link pairs (not just the shell), and require axe `color-contrast` = 0 nodes on the audit harness before/after comparison.

### Step 2 — Touch targets (ALTA)
1. Rail: raise nav rows and the footer controls (`Cerrar sesión` is 98×16) to ≥44px hit height without changing the visual density (padding + negative margin, or an absolutely-positioned hit area).
2. Header brand lockup and auth "Mostrar" control → ≥44px.
3. List rows (`Gracias`, `Versión acústica`): make the **whole row** the target (already a link on some pages) so the hit area is the row, not the 20px text line.
4. **Verification gate:** the harness must report zero elements under 44px on mobile except documented exceptions, and axe `target-size` = 0.

### Step 3 — Mobile navigation completeness (MEDIA)
1. Decide the 5th destination: either add **Miembros** to the mobile tab bar (5 tabs) or expose it plus Ajustes from an overflow entry in the top bar.
2. Keep the accessible names stable so existing specs keep passing; add an E2E that reaches `/people` from mobile chrome.
3. **Verification gate:** the harness `people-roster` flow completes at 390px (today it records a NAV GAP).

### Step 4 — Async feedback and loading (MEDIA)
1. Standardise on one skeleton component for route-level loading (no bare "Cargando…" screen).
2. Give every async mutation an in-place pending state plus a durable success acknowledgement (toast or inline status that survives the render).
3. **Verification gate:** an E2E that asserts the pending→success sequence for invite, apply-plan and file upload.

### Step 5 — Copy pass (MEDIA)
1. Remove release-planning and internal vocabulary ("marcador de posición", "próxima oleada", "v2", "Sin respuesta").
2. Rewrite state labels as user outcomes ("Aún no confirmaste tu asistencia").
3. **Verification gate:** the i18n dictionaries hold no such strings in either language; `clarify` review of the changed copy.

### Step 6 — Mobile account navigation (MEDIA)
1. Give the account tab strip either a scroll affordance (edge fade + `scroll-snap`) or a wrapping layout at narrow widths.
2. **Verification gate:** at 390px every one of the four sections is discoverable without horizontal guessing.

### Step 7 — Hierarchy and density polish (BAJA)
1. Default cover: a subtle accent wash instead of a neutral block.
2. Give the stat tiles a purpose (next action or trend) or shrink them.
3. Two-column group admin on desktop.
4. Wider scrubber on the rail now-playing card.

### Step 8 — Help and documentation (BAJA)
1. Add short contextual explanations for domain concepts that users must distinguish (Borrador vs Plan aplicado; Arrangement vs Song; Resource purposes).
2. Consider an empty-state "primeros pasos" checklist on the group home for new Organizers.

---

## 5. What this audit did **not** cover

- Screen-reader testing with a real AT (axe + semantics checked, not a VoiceOver/NVDA session).
- Performance budgets (Lighthouse was intentionally not added as a project dependency; a one-off `npx lighthouse` run can be produced on request).
- Backend-driven error copy, which is a phase-2 i18n concern.
- Content strategy beyond the copy items listed.
