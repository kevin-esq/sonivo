import { apiRequest } from './http'

/**
 * Managed-account roster (ADR-0047, `Features:ManagedAccounts`). An Owner creates
 * a member without a Sonivo account; the server provisions a managed Identity
 * account and returns the credentials to hand over (no email required).
 */
export type RosterCredentials = {
  memberId: string
  userId: string | null
  /** `temporary_password` | `activation_link` | `handle` | `email` | `none`. */
  credential: string
  mailed: boolean
  temporaryPassword: string | null
  handle: string | null
}

export type CreateRosterMemberInput = {
  displayName: string
  /** When true the server creates a managed account and returns credentials. */
  grantAccess: boolean
  email?: string | null
  handle?: string | null
}

export type RosterListItem = {
  memberId: string
  userId: string | null
  displayName: string
  role: string
  hasAccess: boolean
  handle: string | null
  createdAt: string
}

export async function listRoster(groupId: string): Promise<RosterListItem[]> {
  const payload = await apiRequest<{ items: RosterListItem[] }>(
    `/api/groups/${groupId}/roster`,
  )
  return payload.items
}

export async function createRosterMember(
  groupId: string,
  input: CreateRosterMemberInput,
): Promise<RosterCredentials> {
  return apiRequest<RosterCredentials>(`/api/groups/${groupId}/roster`, {
    method: 'POST',
    body: {
      displayName: input.displayName,
      grantAccess: input.grantAccess,
      email: input.email ?? null,
      handle: input.handle ?? null,
    },
  })
}

export async function resetRosterAccess(
  groupId: string,
  memberId: string,
): Promise<RosterCredentials> {
  return apiRequest<RosterCredentials>(
    `/api/groups/${groupId}/roster/${memberId}/reset-access`,
    { method: 'POST' },
  )
}

export async function removeRosterMember(groupId: string, memberId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/roster/${memberId}`, { method: 'DELETE' })
}
