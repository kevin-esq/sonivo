# @sonivo/mobile — reserved placeholder (FUTURE)

This directory is a **placeholder** for the future Sonivo mobile app. Nothing is
implemented yet; it is intentionally excluded from builds (no scripts).

## Where it lives and why

The mobile app belongs in the `web/` Turborepo workspace as `web/apps/mobile`,
so it shares code with the web apps instead of duplicating it:

- `packages/api-client` — the same typed client over the .NET API.
- `packages/i18n` — the same es/en/pt dictionaries and `useT()` contract.
- `packages/ui` — design tokens and shared primitives.

The **.NET API is the only backend** for mobile too (Identity cookie / token
exchange, SignalR hub, resources). No mobile app talks to PostgreSQL directly.

## Recommended stack (to confirm when the work is scheduled)

- **Expo + React Native** (React 19 + TypeScript), which fits the workspace and
  maximizes code reuse. Expo works in npm/Turborepo monorepos with a Metro config
  that watches the workspace root.
- Native hosting of tenant branding: mobile has no subdomains, so the tenant is
  resolved by an explicit group selector / deep link rather than `Host`.

## If we ever go fully native

React Native is recommended. A Swift/Kotlin native app would **not** belong under
`web/` (Turborepo is JS/TS); it would live in a sibling `mobile/` directory at the
repository root. That is a separate decision (ADR) if it ever becomes necessary.

## Status

- Implementation: NOT STARTED
- Tracked as FUTURE in ADR-0067 / `PHASE-NEXTJS-MULTITENANT-BFF-SPEC.md`.
