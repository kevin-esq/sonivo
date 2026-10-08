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
 * Owner-only group audit log (ADR-0051). Filters are optional; `total` is the
 * count matching the filters, so the caller can paginate.
 */
export type GroupAuditQuery = {
  action?: string | null
  actorUserId?: string | null
  from?: string | null
  to?: string | null
  skip?: number
  take?: number
}

export type GroupAuditPage = {
  items: GroupAuditEntry[]
  total: number
}

export async function listGroupAudit(
  groupId: string,
  query: GroupAuditQuery = {},
): Promise<GroupAuditPage> {
  const params = new URLSearchParams()
  if (query.action) params.set('action', query.action)
  if (query.actorUserId) params.set('actorUserId', query.actorUserId)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.skip != null) params.set('skip', String(query.skip))
  if (query.take != null) params.set('take', String(query.take))
  const qs = params.toString()
  return apiRequest<GroupAuditPage>(`/api/groups/${groupId}/audit${qs ? `?${qs}` : ''}`)
}
