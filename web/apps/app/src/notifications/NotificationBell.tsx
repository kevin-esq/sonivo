import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { listNotifications } from '../api/client'
import { useT } from '../i18n'
import { NotificationInbox } from './NotificationInbox'
import { useNotificationsLive } from './useNotificationsLive'
import { FocusBackdrop } from '../shell/FocusBackdrop'

type NotificationBellProps = (
  | { scope: 'account'; groupId?: never }
  | { scope: 'group'; groupId: string }
) & { onOpenChange?: (open: boolean) => void }

/** One inbox interaction with an explicit account or Group scope. */
export function NotificationBell({ scope, groupId, onOpenChange }: NotificationBellProps) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { onOpenChange?.(open) }, [open, onOpenChange])

  // Live refresh of the unread badge when the server pushes a notification.
  useNotificationsLive(() => setReloadKey((key) => key + 1))

  useEffect(() => {
    let cancelled = false
    void listNotifications(scope, groupId)
      .then((result) => {
        if (!cancelled) setUnread(result.unreadCount)
      })
      .catch(() => {
        // best effort; the panel loads its own copy
      })
    return () => {
      cancelled = true
    }
  }, [scope, groupId, reloadKey])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className={open ? "relative z-30" : "relative"} ref={ref} onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { setOpen(false); buttonRef.current?.focus() }
    }}>
      {open ? <FocusBackdrop testId="notifications-backdrop" className={scope === 'account' ? 'lg:hidden' : 'md:hidden'} onDismiss={() => { setOpen(false); buttonRef.current?.focus() }} /> : null}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={`${scope}-notifications-panel`}
        aria-label={unread > 0 ? t('notifications.bellUnread', { count: unread }) : t(scope === 'account' ? 'notifications.accountTitle' : 'notifications.groupTitle')}
        data-testid={scope === 'account' ? 'app-notifications' : 'group-notifications-bell'}
        className="relative z-20 grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id={`${scope}-notifications-panel`} data-testid={`${scope}-notifications-panel`} className={`fixed inset-x-4 top-[var(--shell-header-height,4rem)] z-30 mt-2 max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-border-subtle bg-surface p-4 shadow-xl ${scope === 'account' ? 'lg:absolute lg:inset-x-auto lg:right-0 lg:top-auto lg:max-h-none lg:w-80' : 'md:absolute md:inset-x-auto md:right-0 md:top-auto md:max-h-none md:w-80'}`}>
          <p className="mb-3 text-sm font-semibold text-ink">{t(scope === 'group' ? 'notifications.groupTitle' : 'notifications.accountTitle')}</p>
          <NotificationInbox scope={scope} groupId={groupId} compact onUnreadChange={setUnread} />
        </div>
      ) : null}
    </div>
  )
}
