import { AccountNotificationsPage } from '@/src/notifications/AccountNotificationsPage'

export const metadata = {
  robots: { index: false, follow: false },
}

export default function ProductNotificationsPage() {
  return <AccountNotificationsPage navigationMode="next" />
}
