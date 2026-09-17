# Gate B — UI redesign (thin spec)

**Status:** **ACCEPTED / CLOSED** 2026-09-17 (Kevin Esquivel). Visual direction: [`GATE-B-DESIGN-BRIEF.md`](../01-product/GATE-B-DESIGN-BRIEF.md) + [`assets/gate-b-ui-reference.jpg`](../01-product/assets/gate-b-ui-reference.jpg).  
**Tickets:** T-GATE-B-01–05 **COMPLETED** (PRs [#22](https://github.com/kevin-esq/sonivo/pull/22)–[#27](https://github.com/kevin-esq/sonivo/pull/27) on `develop`). Local Playwright **15/15** green (2026-09-17).  
**Next ops:** merge `develop` → `main` (authorized). Treat https://sonivo.onrender.com as the public product after that cut.  
**Depends on:** Gate A closed (3.7–3.9, T-OPS-01, T-OPS-02). ADR-0001, 0006, 0010, 0012, 0015–0021, 0024–0025.

This spec does **not** reopen ACCEPTED ADRs. Chrome changes; product behavior stays.

---

## Intent

Replace the current light, documentation-like SPA chrome with the **Sonivo music-workspace** identity in the reference board: dark shell, violet accent, persistent sidebar (desktop), bottom nav (mobile), Spanish copy matching the board.

The user should open the app and immediately see: **what we play, when, which arrangement, what to prepare.**

---

## Visual contract (from the board)

| Token | Hex |
| ----- | --- |
| Primary | `#8366F1` |
| Secondary | `#E8C4F6` |
| Accent | `#9D8BDA` |
| Success | `#7DDB81` |
| Warning | `#F3B626` |
| Error | `#EF4444` |
| Neutral dark | `#0F172A` |
| Neutral light | `#F8FAFC` |

- Wordmark **Sonivo** + tagline **Plan. Play. Together.**
- Logo: waveform / pulse mark — **not** a generic music-note glyph as the primary mark.
- Desktop: left sidebar + top context/search row + content. Sidebar order matches the board: **Inicio, Setlists, Eventos, Biblioteca**, then **Miembros** (desktop). The long brief’s “Biblioteca second” list loses to the board.
- Mobile: compact header + bottom nav (**Inicio, Setlists, Eventos, Biblioteca**). **Do not** shrink the desktop sidebar into a 320px column.
- shadcn/ui as **primitive layer only**, restyled to this board. Lucide for icons. Motion for purposeful reorder/layout. Morphicons only where state morphs (menu↔close, etc.).
- **Do not** add Aceternity / Magic UI / Eldora / Rare / 21st.dev / Anime.js as project dependencies.
- `prefers-reduced-motion` respected. Playwright locators updated in the same ticket as copy/chrome changes.

---

## Shipped surfaces (must be redesigned)

Login · Register · Groups list · Group shell · Library · Song · Arrangement (link Resource) · Setlists · Setlist detail · Events · Event detail (plan, apply/replace, RSVP, cancel) · People (members, invite list/revoke, leave, rename/delete group) · Join.

**Inicio** (group home) may **compose** existing list APIs (next event, recent setlists, song count). **No new backend.** Search in the top bar may filter already-loaded lists; no search API.

---

## PROHIBITION (mockup vs product truth)

The reference board is visual law **except** where it invents capabilities we do not ship:

| Board shows | Product truth |
| ----------- | ------------- |
| Iniciar con Google | **Do not** add Google OAuth. Email + password Identity only. |
| Event “Descripción opcional” | **Out** (closed 3.6: no notes/location). |
| Concert photo / song artwork | Decorative only if we have no image URL. **Do not** invent file/blob (T-3.2.06 **DEFERRED**). |
| Invite/RSVP as “future” in the long brief §31 | **Wrong for this repo.** Invite + RSVP + People **are shipped** — restyle them. |
| File uploads, practice player, stems, albums | **Out.** |

Owner mutate chrome vs Member read chrome stays (ADR-0006). Event Plan remains copy-on-apply; replace still needs `confirmReplace` (ADR-0021). 409 copy stays human, not technical.

---

## Packages (Kevin-authorized for Gate B)

Allowed npm in `web/sonivo-web` if needed: `lucide-react`, shadcn primitives (`class-variance-authority`, `clsx`, `tailwind-merge`, Radix packages **only as each primitive is used**), `motion`. Optional `morphicons` only if a real morph is shipped.

Not allowed: Storybook, Anime.js, Aceternity/Magic/Eldora as deps, new Cursor skills, paid APIs.

Stack remains React / Vite / TS / Tailwind (ADR-0010).

---

## Tickets

| ID | Work | Blocked by |
| -- | ---- | ---------- |
| **T-GATE-B-01** | Tokens + app shell (sidebar, mobile nav, auth screens, groups list, group chrome). Update Playwright helpers/auth/groups. | — |
| **T-GATE-B-02** | Library + Song + Arrangement + link Resource chrome. Playwright library. | 01 |
| **T-GATE-B-03** | Setlist list/detail; numbered items; reorder feel (keyboard alternative required). Playwright scheduling setlist paths. | 01 |
| **T-GATE-B-04** | Event list/create/detail; Event Plan as copied repertoire; apply/replace confirm; RSVP/attendance/cancel chrome. Playwright event + rsvp. | 01 |
| **T-GATE-B-05** | People + invite/revoke + join; Inicio compose from existing APIs. Playwright people + invite. Full suite green. | 01 |

Each ticket: branch `feature/t-gate-b-0N-…` from `develop`, PR `--base develop`, CI green, merge, delete branch. All five tickets are merged.

---

## Done when

1. Shipped surfaces match the board’s identity (dark, violet, sidebar/bottom nav, Spanish copy). — **met**
2. No Google OAuth, no Event notes, no T-3.2.06. — **met**
3. Local Playwright critical journeys green (update helpers in-ticket). — **15/15** (2026-09-17)
4. Member vs Owner chrome still correct. — **met**
5. Kevin accepts the cut. — **ACCEPTED** 2026-09-17. Merge `develop` → `main` is **authorized**.
