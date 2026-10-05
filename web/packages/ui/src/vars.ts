import type { CSSProperties } from 'react'
import type { PublicBranding } from '@sonivo/api-client/types'

export const DEFAULT_PRIMARY = '#8366f1'
export const DEFAULT_SECONDARY = '#e8c4f6'
export const DEFAULT_ON_PRIMARY = '#ffffff'

/**
 * Maps group branding to native CSS variables injected on <html> from the
 * server (ADR-0067). Falls back to the Sonivo defaults when unset.
 */
export function themeVars(branding: PublicBranding | null): CSSProperties {
  return {
    '--color-primary': branding?.accentHex ?? DEFAULT_PRIMARY,
    '--color-secondary': branding?.secondaryHex ?? DEFAULT_SECONDARY,
    '--color-on-primary': DEFAULT_ON_PRIMARY,
  } as CSSProperties
}
