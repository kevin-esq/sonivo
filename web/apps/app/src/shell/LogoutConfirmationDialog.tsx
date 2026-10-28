import { useT } from '../i18n'
import { ConfirmDialog } from '../ui/dialog'

export function LogoutConfirmationDialog({ open, onConfirm, onCancel }: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useT()
  return (
    <ConfirmDialog
      open={open}
      title={t('auth.logoutConfirmTitle')}
      confirmLabel={t('chrome.logout')}
      cancelLabel={t('common.cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>{t('auth.logoutConfirmMessage')}</p>
    </ConfirmDialog>
  )
}
