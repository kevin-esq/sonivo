'use client'

import { routes } from '../routing/routes'
import { useT } from '../i18n'
import { NotificationInbox } from './NotificationInbox'

/**
 * routes.accountNotifications — the account inbox (security/credentials). Distinct
 * from the group inbox shown in the group bell.
 */
export function AccountNotificationsPage({ navigationMode = 'legacy' }: { navigationMode?: 'legacy' | 'next' } = {}) {
  const { t } = useT()
  return (
    <div className="space-y-4">
      <header className="space-y-1.5">
        <h1 className="sonivo-page-title text-ink">{t('notifications.accountTitle')}</h1>
        <p className="text-muted">{t('notifications.accountSubtitle')}</p>
      </header>
      <NotificationInbox scope="account" navigationMode={navigationMode} />
    </div>
  )
}
