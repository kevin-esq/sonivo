/**
 * Sentence-case count label: `plural(1, 'canción', 'canciones') === '1 canción'`.
 * Always prefixes the number so counts never drift between screens.
 * Singular/plural nouns come from i18n; this helper only picks the form.
 */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
