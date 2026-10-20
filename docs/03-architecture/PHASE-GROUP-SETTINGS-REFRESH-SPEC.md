# Phase — Group settings refresh

**Status:** ACCEPTED — user-authorized 2026-10-19; [ADR-0091](DECISIONS.md).
**Scope:** improve the existing Group settings experience and brand editor.

## Goal

Make group settings easier to scan and let an Owner preview branding changes
across the Group workspace before saving or discarding them.

## Requirements

1. Group settings destinations are organized into clear navigation groups;
   existing routes, URL tab values, access rules, and deep links continue to
   work.
2. Unsaved group name and full brand drafts survive navigation among routes in
   the same Group workspace. Preview the group and brand names, tagline, verse,
   cover, logo, banner, typography, theme, and colors wherever each is displayed.
   Stage image uploads until save. A persistent shell action saves or discards
   the full draft. A Group switch clears draft state.
3. The cover picker offers local, authored illustration presets and uploaded
   banners. Presets use stable, server-validated IDs. Existing cover values
   continue to render.
4. Intensity has a visibly distinct effect on the group canvas wash. Primary,
   secondary, accent, and semantic color controls use filled circular swatches.
5. Maintain es/en/pt localization, keyboard operation, visible focus, mobile
   safe-area spacing, plan gating, server validation, and existing authorization.

## Ticket

### T-SETTINGS-01 — Persistent brand editor and visual settings

Implement this phase's requirements across Group settings, the Group shell,
branding validation/rendering, and localized copy. Keep API changes limited to
the finite cover-preset identifier. No new plan, permission, notification,
integration, or audit behavior is included.

## Verification

- Run the frontend TypeScript check and inspect the rendered Group settings and
  cross-route draft behavior at desktop and mobile widths.
- Run the Impeccable detector on the changed UI targets.
- Do not claim browser or end-to-end verification unless it was performed.
