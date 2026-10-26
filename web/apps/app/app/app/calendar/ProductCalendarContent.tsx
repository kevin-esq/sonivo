'use client'

import { CalendarPage } from '@/src/calendar/CalendarPage'

export function ProductCalendarContent() {
  return <CalendarPage navigate={(to) => window.location.assign(to)} />
}
