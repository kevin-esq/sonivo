# Phase — AppHeader restructure, theme-surface tokens and header security

**Status:** **APPROVED — IN PROGRESS (W1)** · owner: Kevin Esquivel · started: 2026-10-01
**Scope owner:** ADR-0043 (ACCEPTED, UI/UX direction). This phase extends the accepted UI direction; it adds no new domain concepts.
**Depends on:** ADR-0006 (mobile-first persona), ADR-0020 (CSRF), ADR-0042/0043 (shell + light theme), `UI-UX-AUDIT-2026-09.md`.
**Branch:** `feature/app-header-restructure` → `develop` (PR per wave, CI green before merge).

---

## 1. Why (problem)

Two screenshots of `/` (Mis grupos) exposed structural, theming and consistency defects:

1. **Two nested boxes.** `GroupsChrome` wraps the page in a white `bg-surface` panel **and** the page draws bordered cards inside it → two box levels for a single group, leaving a dark empty strip below short content.
2. **Fixed colours vs the theme.** The shell/canvas follow the theme, but content uses hard-coded `bg-white`, `border-slate-200`, `text-neutral-dark`. In dark theme the cards read as a white block stuck on a dark page. The dark-theme values of `--color-surface`, `--color-ink`, `--color-muted` are currently set to the **same light values**, so the theme never reaches content.
3. **Header/content misalignment.** The logo is pinned to the viewport edge while the content is centred at `max-w-4xl`.
4. **Header information architecture.** Email, *Cuenta*, *Seguridad* and *Cerrar sesión* sit at the same level; *Seguridad* duplicates `/cuenta/seguridad`; sign-out is one accidental click away; the full email overflows at 360 px.
5. **Hero affordances.** Buttons wrap to two lines, the ghost "Unirme con enlace" reads as text, the counter badge is low-contrast, the subtitle is long.
6. **Card legibility.** Footer meta is 12 px light grey; the affordance is subtle; the avatar initials need stronger contrast.
7. **Missing polish.** No route `document.title`, no shortcuts, no footer, no security nudge.

---

## 2. Decisions (locked with the owner)

| # | Decision |
| --- | --- |
| D1 | **Real dark surfaces.** Content surfaces follow the theme via tokens, not classes. `--color-surface: #111A2E`, `--color-ink: #e2e8f0`, `--color-ink-muted: #94a3b8`, `--color-border-subtle: rgba(255,255,255,.10)`, `--color-surface-hover: rgba(255,255,255,.04)` in dark. |
| D2 | **Secondary text must reach AA in dark.** `#94a3b8` on `#111A2E` = **6.88:1** (verified). The old `#64748b` = **3.63:1** (fails) → hence `ink-muted` is lighter in dark. |
| D3 | **Header colour reuses `--color-shell`** (already theme-aware: `#0F172A` dark / white light). No new CSS for the header; text uses `text-shell-foreground`. |
| D4 | **`AppHeader` in the content column on desktop** inside `GroupWorkspace`; the rail keeps its logo, nav and sign-out. On mobile `AppHeader` carries logo + user menu. Heights aligned at `h-16`. |
| D5 | **Logo text stays "Sonivo"** → `/`, no `aria-label` change (avoids breaking `w9`/`w11` brand assertions). |
| D6 | **Checklist stays only in the group home** (shipped in Wave C). A "x/3 pasos" pill on the groups list is **FUTURE** (needs progress from the API). No `songCount`/`eventCount` backend change now. |
| D7 | **Token migration in two times.** This page + chromes now; the remaining ~386 usages in a **dedicated wave**, route by route, with an equivalence table and an anti-regression guard. |
| D8 | **App version from `package.json`** via `define: { __APP_VERSION__ }` in `vite.config.ts` + `declare const` in `vite-env.d.ts`. No Vitest in this repo, so a single definition suffices. |
| D9 | **Naming:** Tailwind v4 requires the `--color-*` prefix for utilities; the tokens are `--color-surface`, `--color-ink-muted`, `--color-border-subtle`, `--color-surface-hover`. `text-muted` is kept as an alias of `--color-ink-muted` to avoid churn. |

### Token table

| Token | Light | Dark | Replaces |
| --- | --- | --- | --- |
| `--color-surface` | `#ffffff` | `#111A2E` | `bg-white` |
| `--color-surface-hover` | `#f8fafc` | `rgba(255,255,255,.04)` | `bg-neutral-light` |
| `--color-ink` | `#0f172a` | `#e2e8f0` | `text-neutral-dark` |
| `--color-ink-muted` (alias `--color-muted`) | `#64748b` | `#94a3b8` | `text-slate-500/600` |
| `--color-border-subtle` | `#e2e8f0` | `rgba(255,255,255,.10)` | `border-slate-200` |

> **Transient inconsistency (announced in every W1…W3 PR):** only migrated screens switch to the dark surface; the rest still use light utilities. This is intentional until the dedicated migration wave.

---

## 3. Architecture

```
web/sonivo-web/src/
├─ shell/
│  ├─ AppHeader.tsx              NEW  single header (user | guest), skip-link, container
│  ├─ UserMenu.tsx               NEW  avatar + name + sections (Cuenta, prefs, sign-out)
│  ├─ GroupSwitcher.tsx          NEW  pinned + all groups + "Ver todos"/"Nuevo grupo"
│  ├─ groupsCache.tsx            NEW  GroupsCacheProvider (listMyGroups + pinned sync)
│  ├─ GlobalSearch.tsx           NEW  ⌘K command palette (W8)
│  ├─ GroupsChrome.tsx           REF  uses AppHeader; panel removed
│  ├─ UserChrome.tsx             REF  uses AppHeader
│  ├─ VerifyPages.tsx            REF  PublicChrome → AppHeader(user=null)
│  └─ GroupWorkspace.tsx         REF  AppHeader in the content column (desktop)
├─ ui/
│  ├─ menu.tsx                   NEW  ActionMenu extracted (+ header/checked/group sections)
│  └─ index.ts                   REF  export { Menu }
└─ groups/GroupsPage.tsx         REF  hero, card, menu import, groups cache
```

### Contracts

```ts
// ui/menu.tsx — backward-compatible extraction of GroupsPage's ActionMenu
export type MenuItem = {
  key: string; label: string; icon?: LucideIcon; to?: string; onSelect?: () => void
  danger?: boolean; separatorBefore?: boolean
  checked?: boolean; group?: string   // NEW: menuitemradio for language/theme
}
export type MenuSection =
  | { kind: 'header'; name: string; email: string }         // non-clickable
  | { kind: 'items'; label?: string; items: MenuItem[] }
  | { kind: 'notice'; items: MenuItem[] }                   // highlighted (2FA nudge)
export function Menu(props: {
  trigger: ReactNode; label: string; sections: MenuSection[]
}): JSX.Element
```

```ts
// shell/AppHeader.tsx
export function AppHeader(props: {
  user: CurrentUser | null
  groupSlot?: ReactNode      // GroupSwitcher when inside a group
  onLogout?: () => void
}): JSX.Element
// sticky top-0 z-40 h-16 border-b border-shell-border bg-shell/90 backdrop-blur
// <header> → skip-link → <nav aria-label="Principal"> → container mx-auto max-w-6xl px-4 sm:px-6
```

```ts
// shell/groupsCache.tsx
type GroupsCache = {
  groups: GroupSummary[] | null
  reload: () => void
  pinned: string[]
  togglePin: (id: string) => void
}
// one listMyGroups() fetch; revalidated on "/" and after mutations; pinned backed by
// the SAME `sonivo:groups:pinned` key and kept in sync via the `storage` event.
```

---

## 4. Backend changes

| Change | File | Detail |
| --- | --- | --- |
| `totpEnabled` on `/me` | `src/Sonivo.Api/Program.cs:466` | `totpEnabled = await users.GetTwoFactorEnabledAsync(appUser)` (helper already used) |
| `CurrentUser` type | `web/sonivo-web/src/api/client.ts:84` | add `totpEnabled: boolean` |
| API test | `tests/Sonivo.Api.Tests` | `/me` returns the flag true/false |

No schema changes, no migrations, **no new dependencies**.

---

## 5. Accessibility

- Skip link `sr-only focus:not-sr-only` as the header's first child; add `id="main"` to each `<main>` (`GroupsChrome:37`, `UserChrome:75`, `VerifyPages:28`, `GroupWorkspace:393`, `SettingsLayout:42`, `AuthScreen:497`).
- Menu semantics (`menu`/`menuitem`/`menuitemradio`), `aria-haspopup`, `aria-expanded`, roving focus, Esc → trigger, outside click.
- Unified focus ring `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`.
- Touch targets ≥44 px (enforced by `w11`).
- Secondary text contrast asserted by `w6` (extended to content surfaces in both themes).

---

## 6. Tickets

### W1 — Foundation (tokens, structure, header)
- **T-HDR-01** Dark-theme semantic tokens in `index.css` (`surface`, `surface-hover`, `ink`, `ink-muted`, `border-subtle`); `surface-hover`/`border-subtle` new utilities. Verify `ink-muted` ≥ 4.5:1 on `#111A2E`.
- **T-HDR-02** Remove the nested white panel in `GroupsChrome`; content sits on `bg-canvas`; shared container `mx-auto w-full max-w-6xl px-4 sm:px-6`; section rhythm `space-y-6`, page `py-8 sm:py-10`.
- **T-HDR-03** `AppHeader.tsx`: sticky `h-16`, `bg-shell/90 backdrop-blur`, `border-b border-shell-border`, tagline `hidden lg:block`, unified link style, skip link, `nav aria-label="Principal"`. Replace the headers of `GroupsChrome`, `UserChrome`, `PublicChrome`; mount in `GroupWorkspace` content column (desktop), logo/menu on mobile (D4).

### W2 — User menu
- **T-HDR-04** Extract `ActionMenu` → `ui/menu.tsx` (sections: header/items/notice; `checked`/`group` radios); keep `GroupsPage` behaviour.
- **T-HDR-05** `UserMenu.tsx`: avatar (initials from `displayName` → email prefix), name `hidden sm:block max-w-[10rem] truncate`, sections **Cabecera → Cuenta (Perfil/Preferencias/Seguridad/Mis grupos) → Preferencias rápidas (Idioma, Tema) → Cerrar sesión (danger)**.
- **T-HDR-06** Migrate the impacted E2E (`helpers.logout`, `w1`, `w6`, `w11`) + new `w13-app-header.spec.ts`.

### W3 — Page structure, hero and card
- **T-HDR-07** Hero: `flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`; buttons `whitespace-nowrap shrink-0`, drop `w-full justify-center` on `sm:`, "Unirme con enlace" → bordered secondary; subtitle `max-w-xl` + shorter copy; counter `bg-primary/20`.
- **T-HDR-08** Card: footer `text-[13px]` + `text-ink-muted`, clock `aria-hidden`, activity text `title`; stronger hover affordance (`border-primary/50` + shadow + chevron); avatar initials `font-bold` + subtle text-shadow.
- **T-HDR-09** New `w16-groups-page.spec.ts` (structure, button single-line, badge, card a11y).

### W4 — Group switcher
- **T-HDR-10** `groupsCache.tsx` provider; migrate `GroupsPage` pinned state to it.
- **T-HDR-11** `GroupSwitcher.tsx` (`Sonivo / <group> ▾`): pinned → all (by name) → separator → "Ver todos los grupos" (`/`) + "Nuevo grupo"; next-event chip via `describeNextEvent`/`nextEventAt`; mobile shows truncated name only; new `w14-group-switcher.spec.ts`.

### W5 — Reduced
- **T-HDR-12** *(FUTURE, not implemented)* "x/3 pasos" progress pill on the group card, gated on an API progress endpoint. Documented only.

### W6 — Details
- **T-HDR-13** Shortcuts: `N` → Nuevo grupo, `/` → focus search, with an input-focus guard; hint in the button tooltip.
- **T-HDR-14** Route `document.title` ("Mis grupos · Sonivo", …) using the existing, currently-unused `useDocumentTitle`.
- **T-HDR-15** Footer (Ayuda, Privacidad, version) + `__APP_VERSION__` (`vite.config.ts` define + `vite-env.d.ts`).

### W7 — Security nudge (2FA)
- **T-HDR-16** Backend `totpEnabled` + TS type + API test.
- **T-HDR-17** Amber avatar dot when 2FA is off + highlighted menu item → `/cuenta/seguridad`; extend `w13`.

### W8 — Global search
- **T-HDR-18** `GlobalSearch.tsx` (⌘/Ctrl+K): searches actions + navigation + loaded groups (then songs/setlists/events of the current group); new `w15-search.spec.ts`.

### W9 — Dedicated token migration
- **T-HDR-19** Route-by-route migration using the equivalence table (group home, library, events, setlists, people, práctica, cuenta, auth), with a light+dark visual pass each.
- **T-HDR-20** Anti-regression guard `web/sonivo-web/scripts/check-tokens.mjs` + `npm run lint:tokens` wired into the frontend gate/CI (no new dependency).

---

## 7. Per-wave gate

1. `npm run build` (green) · `oxlint` (**0 errors**; pre-existing warnings tracked, no new ones introduced).
2. Targeted E2E for the wave, then the **full** Playwright suite locally (`vite preview`, see `NOW.md`), 100 % green.
3. `dotnet test Sonivo.slnx` when backend touched.
4. Conventional commit (author Kevin Esquivel only, no AI trailers) → push → PR → **CI green** → merge.

## 8. Out of scope

- Notifications bell (needs an endpoint) — FUTURE.
- Native app, backend i18n, any change to the auth mechanism (cookie + antiforgery stands; no web JWT/BFF).
- Redesign of the accepted visual direction (ADR-0043 stands).
