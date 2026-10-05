import type { CSSProperties } from 'react'
import type { PublicBranding } from '@sonivo/api-client/types'

export const DEFAULT_PRIMARY = '#8366f1'
export const DEFAULT_SECONDARY = '#e8c4f6'
export const DEFAULT_ON_PRIMARY = '#ffffff'

/**
 * Maps group branding to native CSS variables injected on <html> from the
 * server (ADR-0065/0067). Emits both the legacy `--color-*` names and the
 * `--brand-*` tokens used by the ported product components, so a group's accent
 * themes the whole UI. Derived hover/active variants stay at their defaults
 * until the OKLCH derivation is ported.
 */
export function themeVars(branding: PublicBranding | null): CSSProperties {
  const primary = branding?.accentHex ?? DEFAULT_PRIMARY
  const secondary = branding?.secondaryHex ?? DEFAULT_SECONDARY

  return {
    '--color-primary': primary,
    '--color-secondary': secondary,
    '--color-on-primary': DEFAULT_ON_PRIMARY,
    '--brand-primary': primary,
    '--brand-on-primary': DEFAULT_ON_PRIMARY,
    '--brand-secondary': secondary,
    '--brand-on-secondary': DEFAULT_ON_PRIMARY,
    '--group-accent': primary,
  } as CSSProperties
}
