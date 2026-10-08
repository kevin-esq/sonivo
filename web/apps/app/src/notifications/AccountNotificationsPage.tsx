import { useT } from '../i18n'
import { NotificationInbox } from './NotificationInbox'

/**
 * `/cuenta/notificaciones` — the account inbox (security/credentials). Distinct
 * from the group inbox shown in the group bell.
 */
export function AccountNotificationsPage() {
  const { t } = useT()
  return (
    <div className="space-y-4">
      <header className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t('notifications.accountTitle')}</h1>
        <p className="text-muted">{t('notifications.accountSubtitle')}</p>
      </header>
      <NotificationInbox scope="account" />
    </div>
  )
}
