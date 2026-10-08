import { apiRequest } from './http'

export type MemberListItem = {
  userId: string
  displayName: string
  role: string
  musicalRole?: string | null
  createdAt: string
  lastSeenAt?: string | null
  email?: string | null
}

export async function listMembers(groupId: string): Promise<MemberListItem[]> {
  const payload = await apiRequest<{ items: MemberListItem[] }>(`/api/groups/${groupId}/members`)
  return payload.items
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
}

export async function changeMemberRole(
  groupId: string,
  userId: string,
  role: 'Owner' | 'Manager' | 'Member' | 'Viewer',
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}/role`, {
    method: 'POST',
    body: { role },
  })
}

/** ADR-0051: Owner or Manager sets a member's descriptive musical role (null clears it). */
export async function setMemberMusicalRole(
  groupId: string,
  userId: string,
  musicalRole: string | null,
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}/musical-role`, {
    method: 'PUT',
    body: { musicalRole },
  })
}

export async function leaveGroup(groupId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/leave`, { method: 'POST' })
}

export type OutstandingInvitation = {
  id: string
  createdAt: string
  expiresAt: string
}

export async function listInvitations(groupId: string): Promise<OutstandingInvitation[]> {
  const payload = await apiRequest<{ items: OutstandingInvitation[] }>(
    `/api/groups/${groupId}/invitations`,
  )
  return payload.items
}

export async function revokeInvitation(groupId: string, invitationId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/invitations/${invitationId}`, { method: 'DELETE' })
}

export type InvitationCreated = {
  id: string
  token: string
  expiresAt: string
  emailed: boolean
}

export type InvitationAccepted = {
  groupId: string
  role: string
}

export async function createInvitation(
  groupId: string,
  email?: string,
): Promise<InvitationCreated> {
  const trimmed = email?.trim()
  return apiRequest<InvitationCreated>(`/api/groups/${groupId}/invitations`, {
    method: 'POST',
    body: trimmed ? { email: trimmed } : {},
  })
}

export async function acceptInvitation(token: string): Promise<InvitationAccepted> {
  return apiRequest<InvitationAccepted>(
    `/api/invitations/${encodeURIComponent(token)}/accept`,
    { method: 'POST' },
  )
}
