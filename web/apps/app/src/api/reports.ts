import { apiRequest } from './http'

export type GroupRepertoireReport = {
  songs: number
  arrangements: number
  files: number
  links: number
  resourcesByPurpose: Array<{ purpose: string; count: number }>
}

export type GroupEventResponseReport = {
  from: string
  to: string
  members: number
  events: Array<{
    eventId: string
    title: string
    type: string
    startsAt: string
    yes: number
    no: number
    maybe: number
    responses: number
    noResponse: number
  }>
}

export type GroupTaskReport = {
  from: string
  to: string
  asOf: string
  total: number
  open: number
  inProgress: number
  done: number
  unassigned: number
  overdue: number
  byAssignee: Array<{ userId: string; displayName: string; count: number }>
}

export type GroupSetlistUsageReport = {
  asOf: string
  setlists: number
  arrangementReferences: number
}

export function getGroupRepertoireReport(groupId: string): Promise<GroupRepertoireReport> {
  return apiRequest(`/api/groups/${groupId}/reports/repertoire`)
}

export function getGroupEventResponseReport(
  groupId: string,
  from: Date,
  to: Date,
): Promise<GroupEventResponseReport> {
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  return apiRequest(`/api/groups/${groupId}/reports/event-responses?${query}`)
}

export function getGroupTaskReport(
  groupId: string,
  from: Date,
  to: Date,
): Promise<GroupTaskReport> {
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  return apiRequest(`/api/groups/${groupId}/reports/tasks?${query}`)
}

export function getGroupSetlistUsageReport(groupId: string): Promise<GroupSetlistUsageReport> {
  return apiRequest(`/api/groups/${groupId}/reports/setlist-usage`)
}

export function groupEventResponseExportUrl(groupId: string, from: Date, to: Date): string {
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  return `/api/groups/${groupId}/reports/event-responses.csv?${query}`
}
