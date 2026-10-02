/**
 * Pure date/time formatting shared across pages. Locale-aware via `Intl`, and
 * deliberately React-free so it can be used anywhere (including tests).
 */

export type DateInput = Date | string | number

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function invalidFallback(value: DateInput): string {
  return typeof value === 'string' ? value : ''
}

/** "15 oct 2026" — short day, month and year. */
export function formatDate(value: DateInput, locale = 'es'): string {
  const date = toDate(value)
  if (!date) return invalidFallback(value)
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}

/** "15 oct 2026, 19:30" — matches the events' `medium`/`short` Intl shape. */
export function formatDateTime(value: DateInput, locale = 'es'): string {
  const date = toDate(value)
  if (!date) return invalidFallback(value)
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

/** "hace 3 días" / "en 3 días"; falls back to a short date beyond ~a month. */
export function formatRelative(value: DateInput, locale = 'es'): string {
  const date = toDate(value)
  if (!date) return invalidFallback(value)
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  if (Math.abs(seconds) < 60) return relative.format(seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return relative.format(days, 'day')
  return formatDate(date, locale)
}

/** Player-style `m:ss` clock, e.g. `formatTime(95) === '1:35'`. */
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const remainder = Math.floor(safe % 60)
  return `${minutes}:${remainder < 10 ? '0' : ''}${remainder}`
}
