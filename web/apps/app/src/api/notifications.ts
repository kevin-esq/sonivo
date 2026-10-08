import { apiRequest } from './http'

/** Two independent inboxes: the user's account vs one group (ADR-0077). */
export type NotificationScope = 'account' | 'group'

export type NotificationKind =
  | 'role_changed'
  | 'invitation_created'
  | 'event_created'
  | 'task_assigned'
  | 'password_changed'
  | 'passkey_added'
  | 'passkey_removed'
  | (string & {})

export type AppNotification = {
  id: string
  kind: NotificationKind
  groupId: string | null
  actorUserId: string | null
  metadata: string | null
  createdAt: string
  readAt: string | null
}

export type NotificationInbox = {
  unreadCount: number
  items: AppNotification[]
}

function scopeQuery(scope: NotificationScope, groupId?: string | null): string {
  const params = new URLSearchParams({ scope })
  if (scope === 'group' && groupId) params.set('groupId', groupId)
  return params.toString()
}

export async function listNotifications(
  scope: NotificationScope,
  groupId?: string | null,
): Promise<NotificationInbox> {
  return apiRequest<NotificationInbox>(`/api/notifications?${scopeQuery(scope, groupId)}`)
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiRequest<void>(`/api/notifications/${notificationId}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead(
  scope: NotificationScope,
  groupId?: string | null,
): Promise<number> {
  const result = await apiRequest<{ updated: number }>(
    `/api/notifications/read-all?${scopeQuery(scope, groupId)}`,
    { method: 'POST' },
  )
  return result.updated
}
