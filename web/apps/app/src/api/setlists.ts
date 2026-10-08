import { apiRequest } from './http'

export type SetlistListItem = {
  id: string
  name: string
  version: number
  itemCount: number
  createdAt: string
  updatedAt: string
}

export type SetlistItem = {
  id: string
  arrangementId: string
  sortOrder: number
  songTitle: string | null
  arrangementLabel: string | null
}

export type SetlistDetail = {
  id: string
  name: string
  version: number
  createdAt: string
  updatedAt: string
  items: SetlistItem[]
}

export async function listSetlists(groupId: string): Promise<SetlistListItem[]> {
  return apiRequest<SetlistListItem[]>(`/api/groups/${groupId}/setlists`)
}

export async function createSetlist(groupId: string, name: string): Promise<SetlistDetail> {
  return apiRequest<SetlistDetail>(`/api/groups/${groupId}/setlists`, {
    method: 'POST',
    body: { name },
  })
}

export async function getSetlist(groupId: string, setlistId: string): Promise<SetlistDetail> {
  return apiRequest<SetlistDetail>(`/api/groups/${groupId}/setlists/${setlistId}`)
}

export async function renameSetlist(
  groupId: string,
  setlistId: string,
  expectedVersion: number,
  name: string,
): Promise<SetlistDetail> {
  return apiRequest<SetlistDetail>(`/api/groups/${groupId}/setlists/${setlistId}`, {
    method: 'PATCH',
    body: { expectedVersion, name },
  })
}

export async function replaceSetlistItems(
  groupId: string,
  setlistId: string,
  expectedVersion: number,
  items: { arrangementId: string; sortOrder: number }[],
): Promise<SetlistDetail> {
  return apiRequest<SetlistDetail>(`/api/groups/${groupId}/setlists/${setlistId}/items`, {
    method: 'PUT',
    body: { expectedVersion, items },
  })
}
