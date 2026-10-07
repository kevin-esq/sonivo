import { apiRequest } from './http'

/** Group audit actions emitted by the server (ADR-0051 append-only log). */
export type GroupAuditAction =
  | 'role_changed'
  | 'musical_role_changed'
  | 'member_removed'
  | 'member_left'
  | 'invitation_created'
  | 'invitation_revoked'
  | (string & {})

export type GroupAuditEntry = {
  id: string
  action: GroupAuditAction
  actorUserId: string | null
  targetUserId: string | null
  /** Short, non-personal detail (e.g. the new role). Never user free text. */
  metadata: string | null
  createdAt: string
}

/**
 * Owner-only group audit log (ADR-0051). Returns the most recent entries,
 * newest first. Non-owners receive 403/404 (never a partial view).
 */
export async function listGroupAudit(groupId: string): Promise<GroupAuditEntry[]> {
  const result = await apiRequest<{ items: GroupAuditEntry[] }>(
    `/api/groups/${groupId}/audit`,
  )
  return result.items
}
