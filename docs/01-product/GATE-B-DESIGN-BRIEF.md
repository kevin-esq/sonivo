# SONIVO — Gate B UI/UX design brief

**Status:** **ACCEPTED / CLOSED** 2026-09-17 (Kevin Esquivel). Implemented as T-GATE-B-01–05 on `develop`.  
**Binding visual board:** [`assets/gate-b-ui-reference.jpg`](assets/gate-b-ui-reference.jpg)  
**Implementation contract (ADRs + tickets):** [`../03-architecture/PHASE-GATE-B-UI-SPEC.md`](../03-architecture/PHASE-GATE-B-UI-SPEC.md)

If this brief and an ACCEPTED ADR conflict, **the ADR wins**. If this brief and the board conflict on chrome, **the board wins**. If the board invents a feature (Google login, Event notes, file artwork), **the spec prohibitions win**.

---

Design the interface and visual system for **Sonivo**, a SaaS platform for organizing music projects.

- Sonivo is NOT Spotify.
- Sonivo is NOT a DAW.
- Sonivo is NOT church-management software.
- Sonivo is NOT an ERP.
- Sonivo is NOT a generic task manager.

Sonivo is the organizational layer around a music project:

**Idea → Song → Arrangement → Rehearsal → Setlist → Event → Performance**

It can serve bands, cover groups, independent artists, choirs, ensembles, small music groups, collaborative projects, music ministries, and small orchestras.

The interface should make users feel they are entering a workspace dedicated to their music, not another generic administrative SaaS.

---

## 1. Design principle

The primary rule is:

> **Music-first, software-second.**

The application should feel like a professional tool for musicians while retaining the clarity, consistency, and ergonomics of a modern SaaS product.

It should convey creativity, organization, collaboration, preparation, confidence, professionalism, energy, and simplicity.

It should not convey boring corporate software, a financial dashboard, a CRM, accounting software, an overly game-like app, an effects-heavy landing page, or a generic AI-generated interface.

The design must be distinctive enough to give Sonivo its own identity.

---

## 2. Visual references and resources

### System foundation — shadcn/ui

Use as a conceptual foundation for buttons, inputs, dialogs, dropdowns, cards, tabs, sheets, tooltips, navigation, forms, tables, toasts, empty states, and the sidebar.

Do not use shadcn without customization. The final interface must feel like Sonivo, not a vanilla shadcn installation.

### Iconography

- **Lucide** — primary visual language.
- **Reicon** — only if Lucide is insufficient; do not mix styles on one screen.
- **Morphicons** — selectively for state-changing icons (menu↔close, play↔pause). Use tactile responses, not decoration.

---

## 3. Animation

**Subtle + useful + musical.** Never spectacle.

Preferences:

1. CSS/Tailwind for simple micro-interactions.
2. Motion for React interactions (reorder, layout, drag).
3. Morphicons for icon transformations.
4. Do **not** install Anime.js for Gate B.

Respect `prefers-reduced-motion`.

Hover 120–180ms · small 150–250ms · layout/reorder 200–350ms · important 300–450ms.

---

## 4. Advanced visual components

Aceternity, Magic UI, Eldora, Rare UI, 21st.dev, and Origin UI are for **selective inspiration**, not dependencies. If a pattern is copied, adapt it to Sonivo's system (color, radius, typography, icons, accessibility) until it no longer looks like a copied component.

---

## 5. Visual philosophy

**Dark / musical / modern / elegant / focused.**

Avoid cyberpunk, neon overload, extreme glassmorphism, gradients everywhere, particles, blobs, 3D, exaggerated shadows, and floating cards without hierarchy.

Use subtle depth, elegant contrast, dark surfaces, controlled luminous accents, clean cards, whitespace, hierarchy, and small musical details.

---

## 6. Color system (board)

See the hex table in the spec. Tailwind tokens: blue-black / charcoal background; elevated surface; soft-white primary text; blue-gray secondary text; violet/indigo accent `#8366F1`. Use gradients exceptionally, not as every component's background.

---

## 7. Branding

Logo: waveform / pulse / synchronization — not a generic music note as the primary mark.

Wordmark: **Sonivo**. Tagline: **Plan. Play. Together.**

---

## 8. Layout

Desktop: persistent sidebar. Board navigation order (the board takes precedence over the draft's Inicio→Biblioteca list): **Inicio, Setlists, Eventos, Biblioteca**, then **Miembros** (desktop), current group, and avatar.

Mobile: bottom navigation **Inicio, Setlists, Eventos, Biblioteca** plus a drawer for **Miembros** and account. Make frequent actions easy to tap during rehearsal.

---

## 9–30. Product screens (summary)

- **Inicio:** preparation hub, not financial KPIs. Show the next event, recent setlists, and library count. Compose from existing APIs.
- **Biblioteca:** music collection (title, Original/Cover/Other, number of Arrangements), not an admin table.
- Keep **Song → Arrangements → Resources** visible.
- **Setlist:** numbering, tactile reordering, add/save. An Event plan is **not** a live view of the Setlist (copy-on-apply).
- **Apply:** show destructive confirmation if a plan already exists (`confirmReplace`).
- **Member:** focused reading and preparation experience, not a “limited version.”
- Use musical, helpful empty states. Use toasts for saves and human-readable 409 conflicts.
- Make accessibility first-class (keyboard, focus, labels, contrast, touch, and an alternative to drag).

Hierarchy: primitives (restyled shadcn) → product components (SongCard, SetlistItem, EventPlanItem, …) → page compositions.

---

## 31. MVP vs. original brief

The long brief listed invites and RSVP as future work. **They have already shipped in this repository.** Gate B redesigns them. File upload, advanced player, stems, and albums are **not included**.

---

## 32. Screen test

Before closing a screen, ask: Can a musician understand it without documentation? Is the primary action obvious? Is the musical context clear? Is the hierarchy clear? Is it fast to use during rehearsal? Does it work on mobile? Does it feel like one product? Is the animation useful? Are there too many cards? Does it look like Sonivo rather than a generic AI SaaS?
