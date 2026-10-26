'use client'

import { useNavigate } from 'react-router-dom'
import { CalendarPage } from './CalendarPage'

export function LegacyCalendarPageAdapter() {
  const navigate = useNavigate()
  return <CalendarPage navigate={navigate} />
}
