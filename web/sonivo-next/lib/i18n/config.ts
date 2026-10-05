export const LOCALES = ['es', 'en', 'pt'] as const

export type Locale = (typeof LOCALES)[number]

/** Spanish is the product default (ADR-0043, extended to pt by ADR-0065). */
export const DEFAULT_LOCALE: Locale = 'es'

export const LOCALE_COOKIE = 'sonivo.locale'

export function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && (LOCALES as readonly string[]).includes(value)
}
