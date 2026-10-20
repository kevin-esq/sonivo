import { apiRequest } from './http'

export type MemberResourceGrant = {
  id: string
  resourceType: 'song' | 'arrangement' | 'resource'
  resourceId: string
  granted: boolean
  createdAt: string
}

export async function listMemberResourceGrants(
  groupId: string,
  userId: string,
): Promise<MemberResourceGrant[]> {
  const payload = await apiRequest<{ items: MemberResourceGrant[] }>(
    `/api/groups/${groupId}/members/${userId}/resource-grants`,
  )
  return payload.items
}

/** `null` inherits from the role and parent path; allow/deny only affects reads. */
export async function setMemberResourceAccess(
  groupId: string,
  userId: string,
  resourceType: MemberResourceGrant['resourceType'],
  resourceId: string,
  granted: boolean | null,
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}/resource-grants`, {
    method: 'PUT',
    body: { resourceType, resourceId, granted },
  })
}

export async function setMemberSongAccess(
  groupId: string,
  userId: string,
  songId: string,
  granted: false | null,
): Promise<void> {
  await setMemberResourceAccess(groupId, userId, 'song', songId, granted)
}
