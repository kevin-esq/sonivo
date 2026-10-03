import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarClock, CheckCircle2, Circle, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createTask,
  deleteTask,
  getGroup,
  listMembers,
  listTasks,
  problemDetail,
  setTaskStatus,
  updateTask,
  type MemberListItem,
  type TaskItem,
} from '../api/client'
import { useT, type I18nKey, type TParams } from '../i18n'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { canManageContentRole, mutationErrorMessage, ProblemAlert } from '../repertoire/ui'
import { useAction } from '../hooks/useAction'
import { useResource } from '../hooks/useResource'

type TaskFilter = 'all' | 'open' | 'done'

function formatDue(iso: string | null, lang: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/**
 * W-G — group tasks (`/groups/:id/tasks`). Manager/Owner create/edit/complete; Member reads.
 */
export function GroupTasksPage() {
  const { groupId } = useParams()
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [group, setGroup] = useState<Awaited<ReturnType<typeof getGroup>> | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [view, setView] = useState<'list' | 'board'>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<TaskItem | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    getGroup(groupId)
      .then((result) => {
        if (!cancelled) setGroup(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setGroup(null)
          setError(problemDetail(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  const surface = useResource(
    group && groupId ? () => listTasks(groupId!) : null,
    [groupId, group, reloadKey],
  )

  const membersSurface = useResource(
    group && groupId ? () => listMembers(groupId!) : null,
    [groupId, group],
  )
  const members = membersSurface.data ?? []

  const tasks = surface.data ?? []
  const visible = useMemo(
    () => (filter === 'all' ? tasks : tasks.filter((task) => (filter === 'done' ? task.status === 'done' : task.status !== 'done'))),
    [tasks, filter],
  )

  if (group === undefined) {
    return <p aria-live="polite">{t('tareas.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error} />
        <Button variant="secondary" onClick={() => navigate('/grupos')}>
          {t('workspace.myGroups')}
        </Button>
      </div>
    )
  }

  const canManage = canManageContentRole(group.role)

  async function toggleStatus(task: TaskItem) {
    if (!groupId) return
    try {
      await setTaskStatus(groupId, task.id, {
        status: task.status === 'done' ? 'open' : 'done',
        expectedVersion: task.version,
      })
      setReloadKey((key) => key + 1)
    } catch (err) {
      setError(mutationErrorMessage(err))
    }
  }

  async function remove(task: TaskItem) {
    if (!groupId) return
    try {
      await deleteTask(groupId, task.id, task.version)
      setReloadKey((key) => key + 1)
    } catch (err) {
      setError(mutationErrorMessage(err))
    }
  }

  async function moveTask(
    task: TaskItem,
    input: { assigneeUserId?: string | null; status?: string },
  ) {
    if (!groupId) return
    try {
      if (input.status) {
        await setTaskStatus(groupId, task.id, {
          status: input.status!,
          expectedVersion: task.version,
        })
      } else {
        await updateTask(groupId, task.id, {
          title: task.title,
          notes: task.notes,
          dueAt: task.dueAt,
          assigneeUserId: input.assigneeUserId ?? null,
          expectedVersion: task.version,
        })
      }
      setReloadKey((key) => key + 1)
    } catch (err) {
      setError(mutationErrorMessage(err))
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="tasks-heading">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 id="tasks-heading" className="text-3xl font-bold tracking-tight text-ink">
              {t('tareas.title')}
            </h1>
            <p className="text-muted">{t('tareas.subtitle')}</p>
          </div>
          {canManage ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('tareas.new')}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('tareas.title')}>
          {([
            { id: 'all', label: t('tareas.filterAll') },
            { id: 'open', label: t('tareas.filterOpen') },
            { id: 'done', label: t('tareas.filterDone') },
          ] as { id: TaskFilter; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                filter === tab.id
                  ? 'bg-primary-strong text-primary-foreground'
                  : 'text-muted hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('tareas.title')}>
            {([
              { id: 'list', label: t('tareas.viewList') },
              { id: 'board', label: t('tareas.viewBoard') },
            ] as { id: 'list' | 'board'; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                onClick={() => setView(tab.id)}
                className={cn(
                  'min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  view === tab.id
                    ? 'bg-primary-strong text-primary-foreground'
                    : 'text-muted hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <ProblemAlert message={error} />

      {surface.loading && tasks.length === 0 ? (
        <p aria-live="polite" className="text-sm text-muted">
          {t('tareas.loading')}
        </p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface px-5 py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-2 font-semibold text-ink">{t('tareas.emptyTitle')}</p>
          <p className="text-sm text-muted">{t('tareas.emptyBody')}</p>
        </div>
      ) : view === 'board' ? (
        <TaskBoard
          tasks={visible}
          members={members}
          canManage={canManage}
          onMove={(task, input) => void moveTask(task, input)}
          t={t}
          lang={lang}
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((task) => {
            const done = task.status === 'done'
            const overdue = !done && task.dueAt != null && new Date(task.dueAt).getTime() < Date.now()
            return (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
              >
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => void toggleStatus(task)}
                    aria-label={done ? t('tareas.reopen') : t('tareas.complete')}
                    className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                    ) : (
                      <Circle className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center text-muted">
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                    ) : (
                      <Circle className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn('font-semibold text-ink', done && 'text-muted line-through')}>
                    {task.title}
                  </p>
                  {task.notes ? (
                    <p className="whitespace-pre-wrap text-sm text-muted">{task.notes}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-medium',
                        done ? 'bg-success/15 text-ink' : 'bg-surface-hover text-muted',
                      )}
                    >
                      {done ? t('tareas.statusDone') : t('tareas.statusOpen')}
                    </span>
                    {task.dueAt ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          overdue && 'font-medium text-error-ink',
                        )}
                      >
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {overdue ? t('tareas.overdue') : t('tareas.dueLabel')}
                        {formatDue(task.dueAt, lang)}
                      </span>
                    ) : null}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(task)}
                      aria-label={`${t('tareas.edit')}: ${task.title}`}
                      className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(task)}
                      aria-label={`${t('tareas.delete')}: ${task.title}`}
                      className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-error-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {showCreate && canManage ? (
        <TaskDialog
          groupId={group.id}
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            setReloadKey((key) => key + 1)
          }}
        />
      ) : null}

      {editing && canManage ? (
        <TaskDialog
          groupId={group.id}
          mode="edit"
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setReloadKey((key) => key + 1)
          }}
        />
      ) : null}
    </section>
  )
}

function TaskDialog({
  groupId,
  mode,
  task,
  onClose,
  onSaved,
}: {
  groupId: string
  mode: 'create' | 'edit'
  task?: TaskItem
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useT()
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dueAt, setDueAt] = useState(task?.dueAt ? task.dueAt.slice(0, 10) : '')
  const [assigneeUserId, setAssigneeUserId] = useState(task?.assigneeUserId ?? '')
  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listMembers(groupId)
      .then((result) => {
        if (!cancelled) setMembers(result)
      })
      .catch(() => {
        if (!cancelled) setMembers([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  const save = useAction(async () => {
    setError(null)
    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null,
      assigneeUserId: assigneeUserId || null,
    }
    if (mode === 'create') {
      await createTask(groupId, payload)
    } else if (task) {
      await updateTask(groupId, task.id, { ...payload, expectedVersion: task.version })
    }
    onSaved()
  })

  return (
    <dialog
      open
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border-subtle bg-surface p-0 text-ink shadow-xl backdrop:bg-slate-900/40"
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void save.run()
        }}
        noValidate
      >
        <h2 className="text-lg font-semibold">
          {mode === 'create' ? t('tareas.new') : t('tareas.edit')}
        </h2>
        <ProblemAlert message={save.error != null ? mutationErrorMessage(save.error) : error} />

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('tareas.fieldTitle')}</span>
          <input
            className={fieldClass}
            value={title}
            maxLength={200}
            disabled={save.pending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('tareas.fieldNotes')}</span>
          <textarea
            className={fieldClass}
            rows={3}
            value={notes}
            maxLength={2000}
            disabled={save.pending}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('tareas.fieldDue')}</span>
          <input
            className={fieldClass}
            type="date"
            value={dueAt}
            disabled={save.pending}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('tareas.fieldAssignee')}</span>
          <select
            className={fieldClass}
            value={assigneeUserId}
            disabled={save.pending}
            onChange={(event) => setAssigneeUserId(event.target.value)}
          >
            <option value="">{t('tareas.fieldAssignee')}</option>
            {(members ?? []).map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={save.pending}>
            {t('tareas.cancel')}
          </Button>
          <Button type="submit" disabled={save.pending || !title.trim()}>
            {save.pending ? t('tareas.saving') : mode === 'create' ? t('tareas.create') : t('tareas.save')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}

function TaskBoard({
  tasks,
  members,
  canManage,
  onMove,
  t,
  lang,
}: {
  tasks: TaskItem[]
  members: MemberListItem[]
  canManage: boolean
  onMove: (
    task: TaskItem,
    input: { assigneeUserId?: string | null; status?: string },
  ) => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)

  const columns = useMemo(() => {
    const cols: { id: string; title: string; tasks: TaskItem[] }[] = [
      {
        id: 'unassigned',
        title: t('tareas.boardUnassigned'),
        tasks: tasks.filter((x) => x.status !== 'done' && !x.assigneeUserId),
      },
      ...members.map((m) => ({
        id: m.userId,
        title: m.displayName,
        tasks: tasks.filter((x) => x.status !== 'done' && x.assigneeUserId === m.userId),
      })),
      {
        id: 'done',
        title: t('tareas.boardDone'),
        tasks: tasks.filter((x) => x.status === 'done'),
      },
    ]
    return cols
  }, [tasks, members, t])

  function handleDrop(columnId: string) {
    if (!dragId) return
    const task = tasks.find((x) => x.id === dragId)
    setDragId(null)
    setOverColumn(null)
    if (!task) return
    if (columnId === 'done') {
      if (task.status !== 'done') onMove(task, { status: 'done' })
    } else if (columnId === 'unassigned') {
      if (task.assigneeUserId || task.status === 'done') {
        onMove(task, { assigneeUserId: null, status: 'open' })
      }
    } else if (task.assigneeUserId !== columnId || task.status === 'done') {
      onMove(task, { assigneeUserId: columnId, status: 'open' })
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {columns.map((column) => (
        <div
          key={column.id}
          className={cn(
            'flex min-h-32 flex-col gap-2 rounded-2xl border p-2 transition-colors',
            overColumn === column.id
              ? 'border-primary bg-surface-hover/40'
              : 'border-border-subtle bg-surface-hover/20',
          )}
          onDragOver={(event) => {
            if (canManage) {
              event.preventDefault()
              setOverColumn(column.id)
            }
          }}
          onDragLeave={() =>
            setOverColumn((current) => (current === column.id ? null : current))
          }
          onDrop={(event) => {
            event.preventDefault()
            handleDrop(column.id)
          }}
        >
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {column.title}
            <span className="ml-1 font-normal">{column.tasks.length}</span>
          </p>
          {column.tasks.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted">—</p>
          ) : (
            column.tasks.map((task) => {
              const done = task.status === 'done'
              const overdue =
                !done && task.dueAt != null && new Date(task.dueAt).getTime() < Date.now()
              return (
                <div
                  key={task.id}
                  draggable={canManage}
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverColumn(null)
                  }}
                  className={cn(
                    'rounded-xl border border-border-subtle bg-surface p-3 shadow-sm',
                    canManage && 'cursor-grab active:cursor-grabbing',
                    dragId === task.id && 'opacity-50',
                  )}
                >
                  <p
                    className={cn(
                      'text-sm font-semibold text-ink',
                      done && 'text-muted line-through',
                    )}
                  >
                    {task.title}
                  </p>
                  {task.dueAt ? (
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        overdue ? 'font-medium text-error-ink' : 'text-muted',
                      )}
                    >
                      {overdue ? t('tareas.overdue') : t('tareas.dueLabel')}{' '}
                      {formatDue(task.dueAt, lang)}
                    </p>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      ))}
    </div>
  )
}
