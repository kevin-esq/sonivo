import { apiRequest } from './http'

export type EventType = 'rehearsal' | 'performance' | 'other'

export type EventListItem = {
  id: string
  title: string
  type: EventType | string
  startsAt: string
  status: string
  version: number
  createdAt: string
  updatedAt: string
}

export type EventPlanItem = {
  id: string
  arrangementId: string
  sortOrder: number
  displaySongTitle: string
  displayArrangementLabel: string
}

export type EventDetail = {
  id: string
  title: string
  type: EventType | string
  startsAt: string
  status: string
  version: number
  createdAt: string
  updatedAt: string
  sourceSetlistId: string | null
  items: EventPlanItem[]
}

export async function listEvents(groupId: string): Promise<EventListItem[]> {
  return apiRequest<EventListItem[]>(`/api/groups/${groupId}/events`)
}

export async function createEvent(
  groupId: string,
  input: { title: string; type: EventType; startsAt: string },
): Promise<EventDetail> {
  return apiRequest<EventDetail>(`/api/groups/${groupId}/events`, {
    method: 'POST',
    body: input,
  })
}

export async function getEvent(groupId: string, eventId: string): Promise<EventDetail> {
  return apiRequest<EventDetail>(`/api/groups/${groupId}/events/${eventId}`)
}

export async function patchEvent(
  groupId: string,
  eventId: string,
  input: { expectedVersion: number; title?: string; type?: EventType; startsAt?: string },
): Promise<EventDetail> {
  return apiRequest<EventDetail>(`/api/groups/${groupId}/events/${eventId}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function cancelEvent(
  groupId: string,
  eventId: string,
  expectedVersion: number,
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/events/${eventId}/cancel`, {
    method: 'POST',
    body: { expectedVersion },
  })
}

export async function duplicateEvent(
  groupId: string,
  eventId: string,
  expectedVersion: number,
): Promise<EventDetail> {
  return apiRequest<EventDetail>(
    `/api/groups/${groupId}/events/${eventId}/duplicate`,
    { method: 'POST', body: { expectedVersion } },
  )
}

export async function deleteEvent(
  groupId: string,
  eventId: string,
  expectedVersion: number,
): Promise<void> {
  await apiRequest<void>(
    `/api/groups/${groupId}/events/${eventId}?expectedVersion=${expectedVersion}`,
    { method: 'DELETE' },
  )
}

export async function applySetlistToEvent(
  groupId: string,
  eventId: string,
  input: { setlistId: string; expectedVersion: number; confirmReplace?: boolean },
): Promise<EventDetail> {
  return apiRequest<EventDetail>(
    `/api/groups/${groupId}/events/${eventId}/apply-setlist`,
    { method: 'POST', body: input },
  )
}

export type EventRsvpResponse = 'yes' | 'no' | 'maybe'

export type EventRsvpItem = {
  userId: string
  displayName: string
  response: EventRsvpResponse | string
  updatedAt: string
}

export type EventRsvpList = {
  items: EventRsvpItem[]
}

export type EventRsvpUpsertResult = {
  userId: string
  response: EventRsvpResponse | string
  updatedAt: string
}

export async function upsertEventRsvp(
  groupId: string,
  eventId: string,
  response: EventRsvpResponse,
): Promise<EventRsvpUpsertResult> {
  return apiRequest<EventRsvpUpsertResult>(
    `/api/groups/${groupId}/events/${eventId}/rsvp`,
    { method: 'PUT', body: { response } },
  )
}

export async function listEventRsvps(
  groupId: string,
  eventId: string,
): Promise<EventRsvpList> {
  return apiRequest<EventRsvpList>(`/api/groups/${groupId}/events/${eventId}/rsvps`)
}
