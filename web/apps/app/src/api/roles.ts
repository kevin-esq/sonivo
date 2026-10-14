import { apiRequest } from './http'

/**
 * Group-defined roles (ADR-0078). Permissions are the canonical keys; a member's
 * effective set is the base role's UNION the custom role's.
 */
export type GroupRole = {
  id: string
  name: string
  description: string | null
  /** Comma-separated canonical permission keys. */
  permissions: string
  isSystem: boolean
  createdAt: string
}

export async function listGroupRoles(groupId: string): Promise<GroupRole[]> {
  const payload = await apiRequest<{ items: GroupRole[] }>(`/api/groups/${groupId}/roles`)
  return payload.items
}

export async function createGroupRole(
  groupId: string,
  input: { name: string; description?: string | null; permissions: string[] },
): Promise<GroupRole> {
  return apiRequest<GroupRole>(`/api/groups/${groupId}/roles`, {
    method: 'POST',
    body: {
      name: input.name,
      description: input.description ?? null,
      permissions: input.permissions,
    },
  })
}

export async function updateGroupRole(
  groupId: string,
  roleId: string,
  input: { name?: string; description?: string | null; permissions?: string[] },
): Promise<GroupRole> {
  return apiRequest<GroupRole>(`/api/groups/${groupId}/roles/${roleId}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function deleteGroupRole(groupId: string, roleId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/roles/${roleId}`, { method: 'DELETE' })
}

/** Assigns a group role to a member (or clears it with null). */
export async function setMemberGroupRole(
  groupId: string,
  userId: string,
  roleId: string | null,
): Promise<void> {
  await apiRequest<void>(
    `/api/groups/${groupId}/members/${userId}/group-role`,
    { method: 'PUT', body: { groupRoleId: roleId } },
  )
}
