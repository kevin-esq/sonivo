import type { GroupBranding } from '../../../api/client'
import type { I18nKey } from '../../../i18n'
import type { BrandDraft } from '../../../shell/brandPreview'
import { GROUP_COVER_PRESETS, NO_COVER } from '../../../shell/groupAccent'

/** Accessible colour names for the accent swatches (values stay hex). */
export const ACCENT_NAME_KEYS: Record<string, I18nKey> = {
  '#8366f1': 'settings.accentViolet',
  '#0ea5e9': 'settings.accentSky',
  '#10b981': 'settings.accentEmerald',
  '#f3b626': 'settings.accentAmber',
  '#ef4444': 'settings.accentRed',
  '#e8c4f6': 'settings.accentLilac',
}

/**
 * Server-validated primary swatches (ADR-0048/0054): each meets WCAG AA against
 * white so the accent can back white header/nav text. The legacy device-local
 * presets are decorative and are not all AA-safe.
 */
export const BRAND_PRIMARY_PRESETS = ['#6d4ee0', '#0369a1', '#047857', '#b45309', '#b91c1c', '#7e22ce'] as const

export const BRAND_IMAGE_MAX_BYTES = 2 * 1024 * 1024

/** Secondary swatches: each meets AA with either white or near-black ink. */
export const BRAND_SECONDARY_PRESETS = ['#0ea5e9', '#10b981', '#f3b626', '#ef4444', '#e8c4f6', '#a78bfa'] as const

export const BRAND_COLOR_NAME_KEYS: Record<string, I18nKey> = {
  '#6d4ee0': 'settings.accentViolet',
  '#0369a1': 'settings.accentSky',
  '#047857': 'settings.accentEmerald',
  '#b45309': 'settings.accentAmber',
  '#b91c1c': 'settings.accentRed',
  '#7e22ce': 'settings.accentLilac',
  '#0ea5e9': 'settings.accentSky',
  '#10b981': 'settings.accentEmerald',
  '#f3b626': 'settings.accentAmber',
  '#ef4444': 'settings.accentRed',
  '#e8c4f6': 'settings.accentLilac',
  '#a78bfa': 'settings.accentLilac',
}

/** ADR-0059: predefined brand palettes (primary + secondary together). */
export const BRAND_PALETTES: { id: string; primary: string; secondary: string }[] = [
  { id: 'oceano', primary: '#0369a1', secondary: '#0ea5e9' },
  { id: 'atardecer', primary: '#b45309', secondary: '#f3b626' },
  { id: 'bosque', primary: '#047857', secondary: '#10b981' },
  { id: 'dark', primary: '#6d4ee0', secondary: '#a78bfa' },
]

export const GRADIENT_NAME_KEYS: Record<string, I18nKey> = {
  violet: 'settings.coverGradientViolet',
  ocean: 'settings.coverGradientOcean',
  forest: 'settings.coverGradientForest',
  sunset: 'settings.coverGradientSunset',
}

export const COVER_PRESET_NAME_KEYS: Record<(typeof GROUP_COVER_PRESETS)[number], I18nKey> = {
  soundwave: 'settings.coverPresetSoundwave',
  stage: 'settings.coverPresetStage',
  vinyl: 'settings.coverPresetVinyl',
  choir: 'settings.coverPresetChoir',
}

export type SettingsTab = 'general' | 'branding' | 'plan' | 'permissions' | 'notifications' | 'integrations' | 'audit' | 'danger'

export const SETTINGS_TABS: { id: SettingsTab; labelKey: I18nKey }[] = [
  { id: 'general', labelKey: 'settings.tabGeneral' },
  { id: 'branding', labelKey: 'settings.tabBranding' },
  { id: 'plan', labelKey: 'settings.tabPlan' },
  { id: 'permissions', labelKey: 'settings.tabPermissions' },
  { id: 'notifications', labelKey: 'settings.tabNotifications' },
  { id: 'integrations', labelKey: 'settings.tabIntegrations' },
  { id: 'audit', labelKey: 'audit.tab' },
  { id: 'danger', labelKey: 'settings.tabDanger' },
]

// Membership/billing is account-level (see /account/membership), not group-owned.
export const SETTINGS_TAB_GROUPS: { labelKey: I18nKey; ids: SettingsTab[] }[] = [
  { labelKey: 'settings.navIdentity', ids: ['general', 'branding'] },
  { labelKey: 'settings.navOperation', ids: ['plan', 'permissions', 'notifications', 'integrations'] },
  { labelKey: 'settings.navAdministration', ids: ['audit', 'danger'] },
]

export function coverFromBranding(branding: GroupBranding): string {
  if (branding.coverKind === 'gradient' && branding.coverValue) return `gradient:${branding.coverValue}`
  if (branding.coverKind === 'preset' && branding.coverValue) return `preset:${branding.coverValue}`
  if (branding.coverKind === 'emoji' && branding.coverValue) return branding.coverValue
  return NO_COVER
}

export function coverToBranding(cover: string): { coverKind: string | null; coverValue: string | null } {
  if (cover === NO_COVER) return { coverKind: null, coverValue: null }
  if (cover.startsWith('gradient:')) return { coverKind: 'gradient', coverValue: cover.slice('gradient:'.length) }
  if (cover.startsWith('preset:')) return { coverKind: 'preset', coverValue: cover.slice('preset:'.length) }
  return { coverKind: 'emoji', coverValue: cover }
}

function asIntensity(value: string | null | undefined): 'subtle' | 'medium' | 'intense' {
  return value === 'subtle' || value === 'intense' ? value : 'medium'
}

function asGradientStyle(value: string | null | undefined): 'fixed' | 'liquid' {
  return value === 'liquid' ? 'liquid' : 'fixed'
}

export function draftFromBranding(branding: GroupBranding): BrandDraft {
  return {
    displayName: branding.displayName ?? '',
    accentHex: branding.accentHex ?? '',
    secondaryHex: branding.secondaryHex ?? '',
    accentColorHex: branding.accentColorHex ?? '',
    successHex: branding.successHex ?? '',
    warningHex: branding.warningHex ?? '',
    errorHex: branding.errorHex ?? '',
    typography: branding.typography ?? 'system',
    cover: coverFromBranding(branding),
    themeDefault: branding.themeDefault ?? 'system',
    defaultLocale: branding.defaultLocale ?? 'es',
    welcomeText: branding.welcomeText ?? '',
    loginHeadline: branding.loginHeadline ?? '',
    tagline: branding.tagline ?? '',
    verse: branding.verse ?? '',
    showSonivoCredit: branding.showSonivoCredit,
    themeId: branding.themeId ?? 'sonivo',
    intensity: asIntensity(branding.intensity),
    gradientStyle: asGradientStyle(branding.gradientStyle),
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}
