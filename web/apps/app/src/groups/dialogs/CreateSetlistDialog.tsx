import { useState } from 'react'
import { createSetlist, type SetlistDetail } from '../../api/client'
import { useT } from '../../i18n'
import { mutationErrorMessage } from '../../repertoire/ui'
import { notifyGroupDataChanged } from '../../shell/groupEvents'
import { GroupButton, GroupDialog, GroupInput } from '../ui'

export type CreateSetlistDialogProps = {
  groupId: string
  onClose: () => void
  /** Return `false` to keep the dialog open (e.g. validation handled by the caller). */
  onCreated: (setlist: SetlistDetail) => void
}

/** Create-setlist modal (ADR-0074 §5). */
export function CreateSetlistDialog({ groupId, onClose, onCreated }: CreateSetlistDialogProps) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setPending(true)
    setError(null)
    try {
      const created = await createSetlist(groupId, name.trim())
      notifyGroupDataChanged('setlists', groupId)
      onCreated(created)
    } catch (err) {
      setError(mutationErrorMessage(err))
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open
      onClose={onClose}
      title={t('agenda.createSetlistTitle')}
      pending={pending}
      testId="create-setlist-dialog"
      onSubmit={() => void submit()}
      footer={
        <>
          <GroupButton variant="secondary" onClick={onClose} disabled={pending}>
            {t('canciones.cancel')}
          </GroupButton>
          <GroupButton type="submit" disabled={pending || !name.trim()}>
            {pending ? t('agenda.creating') : t('agenda.createSetlist')}
          </GroupButton>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}
      <GroupInput
        label={t('agenda.nameLabel')}
        value={name}
        maxLength={200}
        disabled={pending}
        onChange={(event) => setName(event.target.value)}
        data-autofocus
      />
    </GroupDialog>
  )
}
