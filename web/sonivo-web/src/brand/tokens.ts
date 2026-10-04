/**
 * Brand token derivation utilities.
 *
 * Given a small set of base brand colors, derive the full semantic token set
 * used across the workspace. All functions are pure and deterministic so the
 * same input always produces the same output — critical for the live preview
 * and for server-side validation parity.
 */

// ---------- Color math ----------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Relative luminance per WCAG 2.1. */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(rs) + 0.7152 * linear(gs) + 0.0722 * linear(bs);
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick the text color (white or near-black) with the higher AA contrast. */
export function onColor(hex: string): string {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#0f172a')
    ? '#ffffff'
    : '#0f172a';
}

/** Darken a hex color by a percentage (0-1). */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r * (1 - amount),
    rgb.g * (1 - amount),
    rgb.b * (1 - amount),
  );
}

/** Lighten a hex color by a percentage (0-1). */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  );
}

/** Mix a hex color with white by a percentage (0-1). */
export function mixWithWhite(hex: string, amount: number): string {
  return lighten(hex, amount);
}

/** Mix a hex color with black by a percentage (0-1). */
export function mixWithBlack(hex: string, amount: number): string {
  return darken(hex, amount);
}

/** Add alpha to a hex color. */
export function withAlpha(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex;
}

// ---------- Brand token derivation ----------

export type BrandTokens = {
  // Primary
  '--brand-primary': string;
  '--brand-primary-hover': string;
  '--brand-primary-active': string;
  '--brand-primary-soft': string;
  '--brand-primary-border': string;
  '--brand-on-primary': string;
  // Secondary
  '--brand-secondary': string;
  '--brand-on-secondary': string;
  '--brand-secondary-soft': string;
  // Accent
  '--brand-accent': string;
  '--brand-on-accent': string;
  '--brand-accent-soft': string;
  // Semantic
  '--color-success': string;
  '--color-warning': string;
  '--color-error': string;
  '--color-error-ink': string;
  '--color-error-strong': string;
  // Compatibility
  '--group-accent': string;
};

/**
 * Derive the full brand token set from base colors.
 *
 * @param primary   Primary brand color (required)
 * @param secondary Secondary brand color (optional, derived from primary if absent)
 * @param accent    Accent color (optional, derived from primary if absent)
 * @param success   Success color (optional, defaults to a safe green)
 * @param warning   Warning color (optional, defaults to a safe amber)
 * @param error     Error color (optional, defaults to a safe red)
 */
export function deriveBrandTokens(input: {
  primary: string;
  secondary?: string | null;
  accent?: string | null;
  success?: string | null;
  warning?: string | null;
  error?: string | null;
}): BrandTokens {
  const primary = input.primary;
  const secondary = input.secondary || lighten(primary, 0.3);
  const accent = input.accent || darken(primary, 0.15);
  const success = input.success || '#10b981';
  const warning = input.warning || '#f59e0b';
  const error = input.error || '#ef4444';

  return {
    '--brand-primary': primary,
    '--brand-primary-hover': darken(primary, 0.08),
    '--brand-primary-active': darken(primary, 0.15),
    '--brand-primary-soft': withAlpha(primary, '1a'),
    '--brand-primary-border': withAlpha(primary, '40'),
    '--brand-on-primary': onColor(primary),
    '--brand-secondary': secondary,
    '--brand-on-secondary': onColor(secondary),
    '--brand-secondary-soft': withAlpha(secondary, '1a'),
    '--brand-accent': accent,
    '--brand-on-accent': onColor(accent),
    '--brand-accent-soft': withAlpha(accent, '1a'),
    '--color-success': success,
    '--color-warning': warning,
    '--color-error': error,
    '--color-error-ink': darken(error, 0.15),
    '--color-error-strong': darken(error, 0.1),
    '--group-accent': primary,
  };
}

// ---------- Preset palettes ----------

export type BrandPreset = {
  id: string;
  labelKey: string;
  primary: string;
  secondary: string;
  accent: string;
};

export const BRAND_PRESETS: BrandPreset[] = [
  { id: 'violet', labelKey: 'branding.presetViolet', primary: '#6d4ee0', secondary: '#a78bfa', accent: '#8366f1' },
  { id: 'ocean', labelKey: 'branding.presetOcean', primary: '#0369a1', secondary: '#0ea5e9', accent: '#0284c7' },
  { id: 'forest', labelKey: 'branding.presetForest', primary: '#047857', secondary: '#10b981', accent: '#059669' },
  { id: 'sunset', labelKey: 'branding.presetSunset', primary: '#b45309', secondary: '#f59e0b', accent: '#d97706' },
  { id: 'rose', labelKey: 'branding.presetRose', primary: '#be123c', secondary: '#fb7185', accent: '#e11d48' },
  { id: 'slate', labelKey: 'branding.presetSlate', primary: '#334155', secondary: '#64748b', accent: '#475569' },
];

// ---------- Typography options ----------

export type TypographyOption = {
  id: string;
  labelKey: string;
  fontFamily: string;
};

export const TYPOGRAPHY_OPTIONS: TypographyOption[] = [
  { id: 'system', labelKey: 'branding.fontSystem', fontFamily: '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif' },
  { id: 'serif', labelKey: 'branding.fontSerif', fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' },
  { id: 'mono', labelKey: 'branding.fontMono', fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace' },
  { id: 'rounded', labelKey: 'branding.fontRounded', fontFamily: '"Nunito", "Plus Jakarta Sans", system-ui, sans-serif' },
];
