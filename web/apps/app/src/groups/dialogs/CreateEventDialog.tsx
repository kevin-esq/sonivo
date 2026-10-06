import { useState } from 'react'
import { createEvent, type EventDetail, type EventType } from '../../api/client'
import { useT } from '../../i18n'
import { mutationErrorMessage } from '../../repertoire/ui'
import { notifyGroupDataChanged } from '../../shell/groupEvents'
import { fromDatetimeLocalValue } from '../../scheduling/datetime'
import { GroupButton, GroupDialog, GroupInput, GroupSelect } from '../ui'

function defaultStartsAt(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T19:00`
}

export type CreateEventDialogProps = {
  groupId: string
  initialDate?: Date
  onClose: () => void
  onCreated: (event: EventDetail) => void
}

/** Create-event modal, group-scoped (ADR-0074 §5). */
export function CreateEventDialog({
  groupId,
  initialDate,
  onClose,
  onCreated,
}: CreateEventDialogProps) {
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<EventType>('rehearsal')
  const [startsAt, setStartsAt] = useState(() => defaultStartsAt(initialDate ?? new Date()))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const typeOptions = [
    { value: 'rehearsal', label: t('calendario.typeRehearsal') },
    { value: 'performance', label: t('calendario.typePerformance') },
    { value: 'other', label: t('calendario.typeOther') },
  ]

  async function submit() {
    if (!title.trim() || !startsAt) return
    setPending(true)
    setError(null)
    try {
      const created = await createEvent(groupId, {
        title: title.trim(),
        type,
        startsAt: fromDatetimeLocalValue(startsAt),
      })
      notifyGroupDataChanged('events', groupId)
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
      title={t('agenda.createEventTitle')}
      pending={pending}
      testId="create-event-dialog"
      onSubmit={() => void submit()}
      footer={
        <>
          <GroupButton variant="secondary" onClick={onClose} disabled={pending}>
            {t('calendario.cancel')}
          </GroupButton>
          <GroupButton type="submit" disabled={pending || !title.trim() || !startsAt}>
            {pending ? t('calendario.creating') : t('calendario.create')}
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
        label={t('calendario.titleField')}
        value={title}
        maxLength={200}
        disabled={pending}
        onChange={(event) => setTitle(event.target.value)}
        data-autofocus
      />
      <GroupSelect
        label={t('calendario.type')}
        value={type}
        options={typeOptions}
        disabled={pending}
        onChange={(value) => setType(value as EventType)}
      />
      <GroupInput
        label={t('calendario.dateTime')}
        type="datetime-local"
        value={startsAt}
        disabled={pending}
        onChange={(event) => setStartsAt(event.target.value)}
      />
    </GroupDialog>
  )
}
