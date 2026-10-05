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

/**
 * Nudge `hex` toward black or white until it meets `minRatio` against
 * `background`. Used to derive contrast-safe semantic tokens from an arbitrary
 * group brand colour so branding can never produce unreadable UI (WCAG AA).
 */
export function accessibleInk(
  hex: string,
  background: string,
  prefer: 'dark' | 'light',
  minRatio = 4.5,
): string {
  let result = hex;
  for (let i = 0; i < 30; i += 1) {
    if (contrastRatio(result, background) >= minRatio) return result;
    result = prefer === 'dark' ? darken(result, 0.08) : lighten(result, 0.08);
  }
  return result;
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

export type GroupThemeInput = {
  /** Required brand colour; drives primary buttons, links, active states. */
  primary: string;
  secondary?: string | null;
  accent?: string | null;
  success?: string | null;
  warning?: string | null;
  error?: string | null;
  typography?: string | null;
  theme?: 'light' | 'dark';
};

/** Shell surfaces the token set will be rendered on (matches index.css). */
const LIGHT_SHELL = '#ffffff';
const DARK_SHELL = '#0f172a';
/* Ink tokens often sit on the canvas or `bg-surface-hover`, not the flat
   surface. Clamp against the darkest (light theme) / lightest (dark theme)
   shade they can land on so AA holds on every row. */
const LIGHT_INK_BG = '#f1f5f9';
const DARK_INK_BG = '#1f283b';

/**
 * Derive the semantic token overrides that make a group's identity drive the
 * whole workspace. The `--color-*` names are exactly the ones Tailwind's
 * `@theme` exposes (`bg-primary`, `text-primary-ink`, `outline-primary`…), so
 * setting them on the group shell repaints every descendant at once — including
 * light/dark variants — without hard-coding brand colours into components.
 *
 * Every text-bearing token is contrast-clamped to WCAG AA so a group cannot
 * render an unusable interface through branding (see `accessibleInk`).
 */
export function deriveGroupThemeTokens(input: GroupThemeInput): Record<string, string> {
  const theme = input.theme ?? 'light';
  const primary = input.primary;
  const brand = deriveBrandTokens({
    primary,
    secondary: input.secondary,
    accent: input.accent,
    success: input.success,
    warning: input.warning,
    error: input.error,
  });

  const onPrimary = onColor(primary);
  // Solid primary used behind text (`Button` primary, player controls). Keep it
  // readable with the same foreground token used on `bg-primary`.
  const primaryStrong =
    onPrimary === '#ffffff'
      ? accessibleInk(primary, '#ffffff', 'dark')
      : accessibleInk(primary, '#0f172a', 'light');
  const inkBg = theme === 'dark' ? DARK_INK_BG : LIGHT_INK_BG;
  const prefer = theme === 'dark' ? 'light' : 'dark';
  const shell = theme === 'dark' ? DARK_SHELL : LIGHT_SHELL;

  const tokens: Record<string, string> = {
    ...brand,
    '--color-primary': primary,
    '--color-primary-foreground': onPrimary,
    '--color-primary-ink': accessibleInk(primary, inkBg, prefer),
    '--color-primary-strong': primaryStrong,
    '--color-shell-link': accessibleInk(primary, shell, prefer),
    // Theme-aware semantic inks. `deriveBrandTokens` emits a theme-agnostic
    // `--color-error-ink: darken(error)`; on dark that produced a dark red
    // (~2.96:1). Clamp both error and success inks to the themed surface.
    '--color-error-ink': accessibleInk(brand['--color-error'], inkBg, prefer),
    '--color-success-ink': accessibleInk(brand['--color-success'], inkBg, prefer),
  };

  if (input.secondary) {
    tokens['--color-secondary'] = input.secondary;
    tokens['--color-secondary-foreground'] = onColor(input.secondary);
  }
  if (input.accent) tokens['--color-accent'] = input.accent;
  if (input.success) tokens['--color-success'] = input.success;
  if (input.warning) tokens['--color-warning'] = input.warning;
  if (input.error) tokens['--color-error'] = input.error;
  if (input.typography) tokens['--font-sans'] = input.typography;
  return tokens;
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
