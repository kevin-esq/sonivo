import { apiRequest } from './http'

export type UpcomingActivity = {
  groupId: string
  groupName: string
  eventId: string
  title: string
  type: string
  startsAt: string
  /** The caller's RSVP response, or null when they have none (ADR-0053 addendum). */
  myResponse?: string | null
}

/** Upcoming events across every group the caller belongs to (ADR-0053). */
export async function listUpcomingActivity(): Promise<UpcomingActivity[]> {
  return apiRequest<UpcomingActivity[]>('/api/activity/upcoming')
}

/** Read-only general calendar: events across the caller's groups in a date range. */
export async function listCalendarEvents(from: string, to: string): Promise<UpcomingActivity[]> {
  return apiRequest<UpcomingActivity[]>(
    `/api/activity/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  )
}
