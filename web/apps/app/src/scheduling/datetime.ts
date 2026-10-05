/** Convert a datetime-local value to UTC ISO for `startsAt`. */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString()
}

/** Convert a UTC ISO `startsAt` to a datetime-local input value. */
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatStartsAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

export function formatEventType(type: string): string {
  switch (type) {
    case 'rehearsal':
      return 'Ensayo'
    case 'performance':
      return 'Concierto'
    case 'other':
      return 'Otro'
    default:
      return type
  }
}

export function formatEventStatus(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Programado'
    case 'cancelled':
      return 'Cancelado'
    default:
      return status
  }
}
