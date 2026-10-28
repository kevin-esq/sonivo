# Sonivo design system reference

This is a navigation and usage guide, not a second token source. The implementation is authoritative: global tokens and themes are in `web/apps/app/src/index.css` and `web/apps/app/app/globals.css`; shared component chrome is in `web/apps/app/src/ui/shared-components.css`; reusable components live in `web/apps/app/src/ui/` and `web/apps/app/src/groups/ui/`.

## Visual foundations

- **Color:** Tailwind 4 semantic tokens define canvas, shell, surface, ink, muted, border, primary, success, warning, and error roles. The app supports light and dark themes. Group routes derive primary accents from the selected group's brand; account surfaces retain fixed Sonivo branding.
- **Typography:** `--font-sans` and `--font-display` currently use Plus Jakarta Sans with Segoe UI/system fallbacks. Keep body copy readable and use display styling for hierarchy rather than decoration.
- **Shape and spacing:** the current system favors rounded controls and surfaces (`--radius-md/lg/xl`) with Tailwind spacing utilities. Follow nearby component density and maintain clear grouping.
- **Icons:** use `lucide-react` for recognizable actions. Pair non-obvious icons with a visible or accessible label; do not use an icon as the only status signal.
- **Motion:** use short state transitions only when they clarify feedback; honor `prefers-reduced-motion`.

## Component ownership

- `src/ui/` is for fixed Sonivo account/auth surfaces.
- `src/groups/ui/` is for group-scoped surfaces that respond to group brand tokens. Do not cross these ownership boundaries.
- Prefer existing buttons, fields, cards, dialogs, menus, selects, headers, and state components. Add a reusable primitive only when a repeated need and ownership are clear.
- Use the Storybook catalog in the app workspace to inspect real components and their documented states. It is local development tooling and not a production route.

## States and accessibility

Components should expose the states their contract supports: default, hover, keyboard focus, disabled, loading, validation error, empty, and success. Do not fabricate unsupported runtime behavior to demonstrate a state. Follow `UX_GUIDELINES.md` for WCAG, keyboard, focus, target size, reduced motion, and responsive checks.

Storybook is configured with the existing global CSS and the a11y addon. It does not replace browser testing against the application routes or manual checks in both themes.
