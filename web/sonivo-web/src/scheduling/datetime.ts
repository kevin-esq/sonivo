/** Convert a datetime-local value to UTC ISO for `startsAt`. */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString()
}

export function formatStartsAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

export function formatEventType(type: string): string {
  switch (type) {
    case 'rehearsal':
      return 'Rehearsal'
    case 'performance':
      return 'Performance'
    case 'other':
      return 'Other'
    default:
      return type
  }
}
