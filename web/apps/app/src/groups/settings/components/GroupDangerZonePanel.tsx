import { Button } from '../../../ui/button'
import { ConfirmDialog, ProblemAlert } from '../../../repertoire/ui'
import { useT } from '../../../i18n'

type GroupDangerZonePanelProps = {
  open: boolean
  error: string | null
  pending: boolean
  onOpen: () => void
  onConfirm: () => void
  onCancel: () => void
}

export function GroupDangerZonePanel({
  open,
  error,
  pending,
  onOpen,
  onConfirm,
  onCancel,
}: GroupDangerZonePanelProps) {
  const { t } = useT()

  return (
    <section
      aria-labelledby="ajustes-danger-heading"
      className="space-y-3 rounded-2xl border border-error/40 bg-error/5 p-5"
    >
      <h2 id="ajustes-danger-heading" className="text-lg font-semibold text-error-ink">
        {t('dashboard.deleteTitle')}
      </h2>
      <ProblemAlert message={error} />
      <Button variant="danger" onClick={onOpen}>
        {t('dashboard.deleteTitle')}
      </Button>
      <ConfirmDialog
        open={open}
        title={t('dashboard.deleteDialogTitle')}
        confirmLabel={t('dashboard.deleteTitle')}
        cancelLabel={t('dashboard.cancel')}
        pendingLabel={t('dashboard.deleting')}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        <p>{t('dashboard.deleteBody')}</p>
      </ConfirmDialog>
    </section>
  )
}
