import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CalendarDays, CheckCheck, CheckSquare, KeyRound, ShieldCheck, UserPlus, type LucideIcon } from 'lucide-react'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationInbox as Inbox,
  type NotificationKind,
  type NotificationScope,
} from '../api/client'
import { useT, type I18nKey } from '../i18n'
import { mutationErrorMessage } from '../repertoire/ui'
import { cn } from '../ui/cn'

type KindMeta = { icon: LucideIcon; labelKey: I18nKey; tone: string }

const KIND_META: Record<string, KindMeta> = {
  role_changed: { icon: ShieldCheck, labelKey: 'notifications.kind.roleChanged', tone: 'bg-primary/15 text-primary-ink' },
  invitation_created: { icon: UserPlus, labelKey: 'notifications.kind.invitationCreated', tone: 'bg-success/15 text-success-ink' },
  event_created: { icon: CalendarDays, labelKey: 'notifications.kind.eventCreated', tone: 'bg-primary/15 text-primary-ink' },
  task_assigned: { icon: CheckSquare, labelKey: 'notifications.kind.taskAssigned', tone: 'bg-primary/15 text-primary-ink' },
  password_changed: { icon: KeyRound, labelKey: 'notifications.kind.passwordChanged', tone: 'bg-surface-hover text-muted' },
  passkey_added: { icon: KeyRound, labelKey: 'notifications.kind.passkeyAdded', tone: 'bg-surface-hover text-muted' },
  passkey_removed: { icon: KeyRound, labelKey: 'notifications.kind.passkeyRemoved', tone: 'bg-error/15 text-error-ink' },
}

function kindMeta(kind: NotificationKind): KindMeta {
  return KIND_META[kind] ?? { icon: Bell, labelKey: 'notifications.kind.unknown', tone: 'bg-surface-hover text-muted' }
}

/** Client-derived destination (the backend stores no routes). */
function kindLink(notification: AppNotification): string | null {
  switch (notification.kind) {
    case 'role_changed':
    case 'invitation_created':
      return notification.groupId ? `/groups/${notification.groupId}/people` : '/grupos'
    case 'event_created':
      return notification.groupId ? `/groups/${notification.groupId}/events` : '/calendario'
    case 'task_assigned':
      return notification.groupId ? `/groups/${notification.groupId}/tasks` : '/'
    case 'password_changed':
    case 'passkey_added':
    case 'passkey_removed':
      return '/cuenta/seguridad'
    default:
      return null
  }
}

function relativeLabel(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * Notification inbox for one scope (`account` or `group`). The two scopes never
 * mix: account = security/credentials; group = membership/repertoire.
 */
export function NotificationInbox({
  scope,
  groupId,
  compact = false,
  onUnreadChange,
}: {
  scope: NotificationScope
  groupId?: string | null
  compact?: boolean
  onUnreadChange?: (unread: number) => void
}) {
  const { t } = useT()
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const result = await listNotifications(scope, groupId)
        if (cancelled) return
        setInbox(result)
        onUnreadChange?.(result.unreadCount)
      } catch (err) {
        if (!cancelled) setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, groupId])

  async function onRead(notification: AppNotification) {
    if (notification.readAt) return
    setInbox((current) =>
      current
        ? {
            unreadCount: Math.max(0, current.unreadCount - 1),
            items: current.items.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)),
          }
        : current,
    )
    onUnreadChange?.(Math.max(0, (inbox?.unreadCount ?? 1) - 1))
    try {
      await markNotificationRead(notification.id)
    } catch {
      // Best effort; a reload reconciles.
    }
  }

  async function onReadAll() {
    try {
      await markAllNotificationsRead(scope, groupId)
      setInbox((current) =>
        current ? { unreadCount: 0, items: current.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) } : current,
      )
      onUnreadChange?.(0)
    } catch (err) {
      setError(mutationErrorMessage(err))
    }
  }

  return (
    <div className="space-y-3" data-testid={`notifications-${scope}`}>
      {error ? (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {inbox && inbox.unreadCount > 0 ? t('notifications.unread', { count: inbox.unreadCount }) : t('notifications.allRead')}
        </p>
        {inbox && inbox.unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void onReadAll()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-ink hover:underline"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t('notifications.markAll')}
          </button>
        ) : null}
      </div>

      {inbox === null ? (
        <p aria-live="polite" className="text-sm text-muted">
          {t('notifications.loading')}
        </p>
      ) : inbox.items.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-muted">
          {t('notifications.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {inbox.items.map((notification) => {
            const meta = kindMeta(notification.kind)
            const Icon = meta.icon
            const to = kindLink(notification)
            const body = (
              <>
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', meta.tone)} aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn('truncate text-sm text-ink', notification.readAt ? 'font-normal' : 'font-semibold')}>
                      {t(meta.labelKey)}
                    </span>
                    {!notification.readAt ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t('notifications.unreadDot')} />
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted">
                    {relativeLabel(notification.createdAt)}
                    {notification.metadata ? ` · ${notification.metadata}` : ''}
                  </span>
                </span>
              </>
            )
            const classes = cn(
              'flex items-start gap-3 rounded-xl border px-3 py-2.5 no-underline transition-colors',
              notification.readAt
                ? 'border-border-subtle bg-surface'
                : 'border-primary/25 bg-primary/5 hover:bg-primary/10',
            )
            return (
              <li key={notification.id}>
                {to ? (
                  <Link to={to} className={classes} onClick={() => void onRead(notification)}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" className={cn(classes, 'w-full text-left')} onClick={() => void onRead(notification)}>
                    {body}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!compact && inbox && inbox.items.length > 0 ? (
        <Link to="/cuenta/notificaciones" className="inline-block text-xs font-semibold text-primary-ink hover:underline">
          {t('notifications.openAccount')}
        </Link>
      ) : null}
    </div>
  )
}
