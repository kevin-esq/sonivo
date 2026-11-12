'use client'

import { routes } from '../routing/routes'
import { useT } from '../i18n'
import { NotificationInbox } from './NotificationInbox'
import { AccountSettingsLayout } from '../shell/account/AccountSettingsLayout'

/**
 * routes.accountNotifications — the account inbox (security/credentials). Distinct
 * from the group inbox shown in the group bell.
 */
export function AccountNotificationsPage({ navigationMode = 'legacy' }: { navigationMode?: 'legacy' | 'next' } = {}) {
  const { t } = useT()
  return (
    <AccountSettingsLayout
      active="notifications"
      title={t('notifications.accountTitle')}
      description={t('notifications.accountSubtitle')}
    >
      <NotificationInbox scope="account" navigationMode={navigationMode} />
    </AccountSettingsLayout>
  )
}
