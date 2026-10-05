import type { CSSProperties } from 'react'

export const DEFAULT_GROUP_ACCENT = '#8366f1'

export const GROUP_ACCENT_PRESETS = [
  '#8366f1',
  '#0ea5e9',
  '#10b981',
  '#f3b626',
  '#ef4444',
  '#e8c4f6',
] as const

export const GROUP_COVER_EMOJIS = ['🎵', '🎸', '🥁', '🎹', '🎺', '🎤'] as const

export const GROUP_COVER_GRADIENTS = ['violet', 'ocean', 'forest', 'sunset'] as const

/** Stored cover value for the "no cover" choice: a plain surfaced tile, never a gradient. */
export const NO_COVER = 'none'

export type GroupAppearance = {
  accent: string
  cover: string
}

export function groupAppearanceKey(groupId: string): string {
  return `sonivo:group-accent:${groupId}`
}

export function defaultAppearance(): GroupAppearance {
  return { accent: DEFAULT_GROUP_ACCENT, cover: GROUP_COVER_EMOJIS[0] ?? '🎵' }
}

export function readGroupAppearance(groupId: string | undefined): GroupAppearance {
  const fallback = defaultAppearance()
  if (!groupId) return fallback
  try {
    const raw = window.localStorage.getItem(groupAppearanceKey(groupId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<GroupAppearance>
    return {
      accent: typeof parsed.accent === 'string' && parsed.accent ? parsed.accent : fallback.accent,
      cover: typeof parsed.cover === 'string' && parsed.cover ? parsed.cover : fallback.cover,
    }
  } catch {
    return fallback
  }
}

export function writeGroupAppearance(groupId: string, appearance: GroupAppearance): void {
  try {
    window.localStorage.setItem(groupAppearanceKey(groupId), JSON.stringify(appearance))
  } catch {
    // persist best-effort only
  }
}

export function isGradientCover(cover: string): boolean {
  return cover.startsWith('gradient:')
}

export function isNoneCover(cover: string): boolean {
  return cover === NO_COVER
}

/** True when the cover needs light text on top; the plain "no cover" tile needs dark text. */
export function coverUsesLightText(cover: string): boolean {
  return !isNoneCover(cover)
}

function withAlpha(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex
}

export function groupCoverStyle(cover: string, accent: string): CSSProperties {
  if (isNoneCover(cover)) {
    // Subtle accent wash over a light surface (dark ink stays readable) instead
    // of a flat neutral block, so "no cover" still reads as the group's colour.
    return {
      backgroundImage: `linear-gradient(135deg, ${withAlpha(accent, '26')}, ${withAlpha(accent, '0a')})`,
      // Theme-aware surface/ink so "no cover" is not a white block in dark mode
      // and still carries the group accent wash in light mode.
      backgroundColor: 'var(--color-surface, #ffffff)',
      color: 'var(--color-ink, #0f172a)',
    }
  }
  if (isGradientCover(cover)) {
    const id = cover.slice('gradient:'.length)
    const stops: Record<string, string> = {
      violet: `${accent}, #2b1a5e`,
      ocean: `${accent}, #0ea5e9`,
      forest: `${accent}, #10b981`,
      sunset: `${accent}, #f3b626`,
    }
    return {
      backgroundImage: `linear-gradient(135deg, ${stops[id] ?? stops.violet})`,
      color: '#ffffff',
    }
  }
  return {
    backgroundImage: `linear-gradient(120deg, ${withAlpha(accent, 'cc')}, ${withAlpha(accent, '33')})`,
    color: '#ffffff',
  }
}
