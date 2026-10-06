import { useEffect, useState } from 'react'
import {
  createTask,
  listMembers,
  updateTask,
  type MemberListItem,
  type TaskItem,
} from '../../api/client'
import { useT } from '../../i18n'
import { mutationErrorMessage } from '../../repertoire/ui'
import { notifyGroupDataChanged } from '../../shell/groupEvents'
import { GroupButton, GroupDialog, GroupInput, GroupSelect, GroupTextArea } from '../ui'

function toLocalDateValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export type CreateTaskDialogProps = {
  groupId: string
  /** Preloaded members; fetched on open when omitted. */
  members?: MemberListItem[]
  /** Provide a task to edit instead of create. */
  task?: TaskItem
  onClose: () => void
  onSaved: () => void
}

/** Create/edit task modal (ADR-0074 §5). */
export function CreateTaskDialog({
  groupId,
  members,
  task,
  onClose,
  onSaved,
}: CreateTaskDialogProps) {
  const { t } = useT()
  const [memberList, setMemberList] = useState<MemberListItem[] | null>(members ?? null)
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dueAt, setDueAt] = useState(toLocalDateValue(task?.dueAt))
  const [assigneeUserId, setAssigneeUserId] = useState(task?.assigneeUserId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (members) {
      setMemberList(members)
      return
    }
    let cancelled = false
    listMembers(groupId)
      .then((list) => {
        if (!cancelled) setMemberList(list)
      })
      .catch(() => {
        if (!cancelled) setMemberList([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId, members])

  const assigneeOptions = [
    { value: '', label: '—' },
    ...(memberList ?? [])
      .filter((member) => member.userId)
      .map((member) => ({ value: member.userId, label: member.displayName })),
  ]

  async function submit() {
    if (!title.trim()) return
    setPending(true)
    setError(null)
    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null,
      assigneeUserId: assigneeUserId || null,
    }
    try {
      if (task) {
        await updateTask(groupId, task.id, { ...payload, expectedVersion: task.version })
      } else {
        await createTask(groupId, payload)
      }
      notifyGroupDataChanged('tasks', groupId)
      onSaved()
    } catch (err) {
      setError(mutationErrorMessage(err))
      setPending(false)
    }
  }

  const editing = Boolean(task)

  return (
    <GroupDialog
      open
      onClose={onClose}
      title={editing ? t('tareas.edit') : t('tareas.new')}
      pending={pending}
      testId="task-form-dialog"
      onSubmit={() => void submit()}
      footer={
        <>
          <GroupButton variant="secondary" onClick={onClose} disabled={pending}>
            {t('tareas.cancel')}
          </GroupButton>
          <GroupButton type="submit" disabled={pending || !title.trim()}>
            {pending ? t('tareas.saving') : editing ? t('tareas.save') : t('tareas.create')}
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
        label={t('tareas.fieldTitle')}
        value={title}
        maxLength={200}
        disabled={pending}
        onChange={(event) => setTitle(event.target.value)}
        data-autofocus
      />
      <GroupTextArea
        label={t('tareas.fieldNotes')}
        rows={3}
        value={notes}
        maxLength={2000}
        disabled={pending}
        onChange={(event) => setNotes(event.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <GroupInput
          label={t('tareas.fieldDue')}
          type="date"
          value={dueAt}
          disabled={pending}
          onChange={(event) => setDueAt(event.target.value)}
        />
        <GroupSelect
          label={t('tareas.fieldAssignee')}
          value={assigneeUserId}
          options={assigneeOptions}
          disabled={pending}
          onChange={setAssigneeUserId}
        />
      </div>
    </GroupDialog>
  )
}
