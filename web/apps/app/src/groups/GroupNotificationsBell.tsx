import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { listNotifications } from '../api/client'
import { useT } from '../i18n'
import { NotificationInbox } from '../notifications/NotificationInbox'
import { useNotificationsLive } from '../notifications/useNotificationsLive'

/**
 * Group-scoped notification bell for the group top bar. Shows the group inbox
 * (membership/repertoire) — separate from the account inbox.
 */
export function GroupNotificationsBell({ groupId }: { groupId: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Live refresh of the unread badge when the server pushes a notification.
  useNotificationsLive(() => setReloadKey((key) => key + 1))

  useEffect(() => {
    let cancelled = false
    void listNotifications('group', groupId)
      .then((result) => {
        if (!cancelled) setUnread(result.unreadCount)
      })
      .catch(() => {
        // best effort; the panel loads its own copy
      })
    return () => {
      cancelled = true
    }
  }, [groupId, reloadKey])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell')}
        data-testid="group-notifications-bell"
        className="relative grid h-11 w-11 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-border-subtle bg-surface p-4 shadow-xl">
          <p className="mb-3 text-sm font-semibold text-ink">{t('notifications.groupTitle')}</p>
          <NotificationInbox scope="group" groupId={groupId} compact onUnreadChange={setUnread} />
        </div>
      ) : null}
    </div>
  )
}
