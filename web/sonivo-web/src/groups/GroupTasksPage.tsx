import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, DragEvent, ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react'
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

/* ────────── status helpers ────────── */

type BoardStatus = 'open' | 'in_progress' | 'done'

const BOARD_COLUMNS: BoardStatus[] = ['open', 'in_progress', 'done']

const STATUS_META: Record<BoardStatus, {
  labelKey: I18nKey
  columnKey: I18nKey
  color: string
  bgClass: string
  iconColor: string
}> = {
  open: {
    labelKey: 'tareas.statusOpen',
    columnKey: 'tareas.boardNotStarted',
    color: 'text-muted',
    bgClass: 'bg-surface-hover/60',
    iconColor: 'text-muted',
  },
  in_progress: {
    labelKey: 'tareas.statusInProgress',
    columnKey: 'tareas.boardInProgress',
    color: 'text-primary-ink',
    bgClass: 'bg-primary/10',
    iconColor: 'text-primary-ink',
  },
  done: {
    labelKey: 'tareas.statusDone',
    columnKey: 'tareas.boardDone',
    color: 'text-success',
    bgClass: 'bg-success/10',
    iconColor: 'text-success',
  },
}

function statusIcon(status: string, className = 'h-4 w-4') {
  const s = status as BoardStatus
  switch (s) {
    case 'done':
      return <CheckCircle2 className={cn(className, STATUS_META.done.iconColor)} aria-hidden="true" />
    case 'in_progress':
      return <Clock className={cn(className, STATUS_META.in_progress.iconColor)} aria-hidden="true" />
    default:
      return <Circle className={cn(className, STATUS_META.open.iconColor)} aria-hidden="true" />
  }
}

function formatDue(iso: string | null, lang: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function memberName(members: MemberListItem[], userId: string | null): string | null {
  if (!userId) return null
  return members.find((m) => m.userId === userId)?.displayName ?? null
}

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

type TaskFilter = 'all' | 'open' | 'done'

/* ─────────────── main page ─────────────── */

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
  const [view, setView] = useState<'list' | 'board'>('board')
  const [showCreate, setShowCreate] = useState(false)
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null)
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

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

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

  async function changeStatus(task: TaskItem, status: string) {
    if (!groupId) return
    try {
      await setTaskStatus(groupId, task.id, {
        status,
        expectedVersion: task.version,
      })
      reload()
    } catch (err) {
      setError(mutationErrorMessage(err))
    }
  }

  async function remove(task: TaskItem) {
    if (!groupId) return
    try {
      await deleteTask(groupId, task.id, task.version)
      reload()
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

        {/* View toggle: List / Board */}
        <div className="flex items-center gap-4">
          <div className="flex gap-1 rounded-xl bg-surface-hover/50 p-1" role="tablist" aria-label={t('tareas.title')}>
            {([
              { id: 'board', label: t('tareas.viewBoard') },
              { id: 'list', label: t('tareas.viewList') },
            ] as { id: 'list' | 'board'; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                onClick={() => setView(tab.id)}
                className={cn(
                  'min-h-9 rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  view === tab.id
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-muted hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filters (list view only) */}
          {view === 'list' ? (
            <div className="flex gap-1" role="tablist" aria-label={t('tareas.title')}>
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
          ) : null}
        </div>
      </header>

      <ProblemAlert message={error} />

      {surface.loading && tasks.length === 0 ? (
        <p aria-live="polite" className="text-sm text-muted">
          {t('tareas.loading')}
        </p>
      ) : visible.length === 0 && view === 'list' ? (
        <div className="rounded-2xl border border-border-subtle bg-surface px-5 py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-2 font-semibold text-ink">{t('tareas.emptyTitle')}</p>
          <p className="text-sm text-muted">{t('tareas.emptyBody')}</p>
        </div>
      ) : view === 'board' ? (
        <TaskBoard
          tasks={tasks}
          members={members}
          canManage={canManage}
          onStatusChange={(task, status) => void changeStatus(task, status)}
          onCardClick={(task) => setDetailTask(task)}
          t={t}
          lang={lang}
        />
      ) : (
        <TaskListView
          tasks={visible}
          members={members}
          canManage={canManage}
          onToggle={(task) => void changeStatus(task, task.status === 'done' ? 'open' : 'done')}
          onEdit={(task) => setDetailTask(task)}
          onDelete={(task) => void remove(task)}
          t={t}
          lang={lang}
        />
      )}

      {showCreate && canManage ? (
        <TaskFormDialog
          groupId={group.id}
          mode="create"
          members={members}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            reload()
          }}
        />
      ) : null}

      {detailTask ? (
        <TaskDetailModal
          groupId={group.id}
          task={detailTask}
          members={members}
          canManage={canManage}
          onClose={() => setDetailTask(null)}
          onUpdated={() => {
            setDetailTask(null)
            reload()
          }}
          onDeleted={() => {
            setDetailTask(null)
            reload()
          }}
          t={t}
          lang={lang}
        />
      ) : null}
    </section>
  )
}

/* ─────────────── list view ─────────────── */

function TaskListView({
  tasks,
  members,
  canManage,
  onToggle,
  onEdit,
  onDelete,
  t,
  lang,
}: {
  tasks: TaskItem[]
  members: MemberListItem[]
  canManage: boolean
  onToggle: (task: TaskItem) => void
  onEdit: (task: TaskItem) => void
  onDelete: (task: TaskItem) => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  return (
    <ul className="space-y-2">
      {tasks.map((task) => {
        const done = task.status === 'done'
        const overdue = !done && task.dueAt != null && new Date(task.dueAt).getTime() < Date.now()
        const assignee = memberName(members, task.assigneeUserId)
        return (
          <li
            key={task.id}
            className="group flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface p-4 transition-colors hover:border-primary/30"
          >
            {canManage ? (
              <button
                type="button"
                onClick={() => onToggle(task)}
                aria-label={done ? t('tareas.reopen') : t('tareas.complete')}
                className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {statusIcon(task.status, 'h-5 w-5')}
              </button>
            ) : (
              <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center text-muted">
                {statusIcon(task.status, 'h-5 w-5')}
              </span>
            )}
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="min-w-0 flex-1 text-left"
            >
              <p className={cn('font-semibold text-ink', done && 'text-muted line-through')}>
                {task.title}
              </p>
              {task.notes ? (
                <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted">{task.notes}</p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 font-medium',
                    STATUS_META[task.status as BoardStatus]?.bgClass ?? 'bg-surface-hover',
                    STATUS_META[task.status as BoardStatus]?.color ?? 'text-muted',
                  )}
                >
                  {t(STATUS_META[task.status as BoardStatus]?.labelKey ?? 'tareas.statusOpen')}
                </span>
                {task.dueAt ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      overdue && 'font-medium text-error-ink',
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {overdue ? t('tareas.overdue') : t('tareas.dueLabel')}{' '}
                    {formatDue(task.dueAt, lang)}
                  </span>
                ) : null}
                {assignee ? (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                    {assignee}
                  </span>
                ) : null}
              </div>
            </button>
            {canManage ? (
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(task)}
                  aria-label={`${t('tareas.edit')}: ${task.title}`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(task)}
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
  )
}

/* ─────────────── kanban board (Trello / Planner style) ─────────────── */

function TaskBoard({
  tasks,
  members,
  canManage,
  onStatusChange,
  onCardClick,
  t,
  lang,
}: {
  tasks: TaskItem[]
  members: MemberListItem[]
  canManage: boolean
  onStatusChange: (task: TaskItem, newStatus: string) => void
  onCardClick: (task: TaskItem) => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)

  // Group tasks into columns by status
  const normalizedColumns = useMemo(() => {
    // Tasks with status 'open' go into the 'open' (Not Started) column
    // Tasks with status 'in_progress' go into the 'in_progress' column
    // Tasks with status 'done' go into the 'done' column
    // Any unrecognized status goes into 'open'
    return BOARD_COLUMNS.map((status) => ({
      id: status,
      title: t(STATUS_META[status].columnKey),
      tasks: tasks.filter((x) => {
        if (status === 'open') return x.status === 'open'
        if (status === 'in_progress') return x.status === 'in_progress'
        if (status === 'done') return x.status === 'done'
        return false
      }),
    }))
  }, [tasks, t])

  function handleDrop(columnStatus: BoardStatus) {
    if (!dragId) return
    const task = tasks.find((x) => x.id === dragId)
    setDragId(null)
    setOverColumn(null)
    if (!task || task.status === columnStatus) return
    onStatusChange(task, columnStatus)
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-hover/10 p-3 sm:p-4" style={{ backgroundImage: 'radial-gradient(circle, var(--color-border-subtle) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {normalizedColumns.map((column) => (
          <BoardColumn
            key={column.id}
            id={column.id}
            title={column.title}
            tasks={column.tasks}
            members={members}
            canManage={canManage}
            isOver={overColumn === column.id}
            dragId={dragId}
            onDragStart={(id) => setDragId(id)}
            onDragEnd={() => { setDragId(null); setOverColumn(null) }}
            onDragOver={(colId) => setOverColumn(colId)}
            onDragLeave={(colId) => setOverColumn((c) => (c === colId ? null : c))}
            onDrop={() => handleDrop(column.id as BoardStatus)}
            onCardClick={onCardClick}
            t={t}
            lang={lang}
          />
        ))}
      </div>
    </div>
  )
}

/* ─── column ─── */

function BoardColumn({
  id,
  title,
  tasks,
  members,
  canManage,
  isOver,
  dragId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardClick,
  t,
  lang,
}: {
  id: string
  title: string
  tasks: TaskItem[]
  members: MemberListItem[]
  canManage: boolean
  isOver: boolean
  dragId: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (colId: string) => void
  onDragLeave: (colId: string) => void
  onDrop: () => void
  onCardClick: (task: TaskItem) => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const meta = STATUS_META[id as BoardStatus] ?? STATUS_META.open

  return (
    <div
      className={cn(
        'flex min-h-[200px] flex-col rounded-2xl transition-all duration-200',
        'bg-surface-hover/20 border',
        isOver
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
          : 'border-border-subtle',
      )}
      onDragOver={(event: DragEvent) => {
        if (canManage) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          onDragOver(id)
        }
      }}
      onDragLeave={() => onDragLeave(id)}
      onDrop={(event: DragEvent) => {
        event.preventDefault()
        onDrop()
      }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-3">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg', meta.bgClass)} aria-hidden="true">
          {statusIcon(id, 'h-3.5 w-3.5')}
        </span>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          {title}
        </p>
        <span className="ml-auto rounded-full bg-surface-hover px-2 py-0.5 text-xs font-semibold text-muted">
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {tasks.length === 0 ? (
          <div className={cn(
            'flex flex-1 items-center justify-center rounded-xl border border-dashed py-6 text-xs text-muted transition-colors',
            isOver ? 'border-primary/50 bg-primary/5' : 'border-border-subtle',
          )}>
            {t('tareas.noTasks')}
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              members={members}
              canManage={canManage}
              isDragging={dragId === task.id}
              onDragStart={() => onDragStart(task.id)}
              onDragEnd={onDragEnd}
              onClick={() => onCardClick(task)}
              lang={lang}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ─── card ─── */

function TaskCard({
  task,
  members,
  canManage,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
  lang,
}: {
  task: TaskItem
  members: MemberListItem[]
  canManage: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
  lang: string
}) {
  const done = task.status === 'done'
  const overdue = !done && task.dueAt != null && new Date(task.dueAt).getTime() < Date.now()
  const assignee = memberName(members, task.assigneeUserId)

  return (
    <div
      draggable={canManage}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      role="button"
      tabIndex={0}
      className={cn(
        'group relative cursor-pointer rounded-xl border border-border-subtle bg-surface p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200',
        'hover:border-primary/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.06)]',
        canManage && 'cursor-grab active:cursor-grabbing',
        /* Trello-style tilt while dragging */
        isDragging && 'rotate-[3deg] scale-105 opacity-70 shadow-[0_12px_32px_rgba(0,0,0,0.2),0_4px_8px_rgba(0,0,0,0.1)] ring-2 ring-primary/30',
      )}
      style={isDragging ? { zIndex: 50 } : undefined}
    >
      {/* Grab handle (only when manager hovers) */}
      {canManage ? (
        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-50">
          <GripVertical className="h-4 w-4 text-muted" aria-hidden="true" />
        </div>
      ) : null}

      {/* Title */}
      <p className={cn(
        'text-sm font-semibold text-ink leading-snug',
        done && 'text-muted line-through',
      )}>
        {task.title}
      </p>

      {/* Notes preview */}
      {task.notes ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted leading-relaxed">
          {task.notes}
        </p>
      ) : null}

      {/* Bottom metadata row */}
      <div className="mt-2.5 flex items-center gap-2">
        {/* Due date */}
        {task.dueAt ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
              overdue
                ? 'bg-error/10 text-error-ink'
                : done
                  ? 'bg-success/10 text-success'
                  : 'bg-surface-hover text-muted',
            )}
          >
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            {formatDue(task.dueAt, lang)}
          </span>
        ) : null}

        {/* Assignee avatar */}
        {assignee ? (
          <span
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary-ink"
            title={assignee}
          >
            {initials(assignee)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/* ─────────────── task detail modal (Trello-style) ─────────────── */

function TaskDetailModal({
  groupId,
  task,
  members,
  canManage,
  onClose,
  onUpdated,
  onDeleted,
  t,
  lang,
}: {
  groupId: string
  task: TaskItem
  members: MemberListItem[]
  canManage: boolean
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [dueAt, setDueAt] = useState(task.dueAt ? task.dueAt.slice(0, 10) : '')
  const [assigneeUserId, setAssigneeUserId] = useState(task.assigneeUserId ?? '')
  const [status, setStatus] = useState(task.status)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
    }
  }, [])

  const saveAction = useAction(async () => {
    setError(null)
    // Update status if changed
    if (status !== task.status) {
      await setTaskStatus(groupId, task.id, {
        status,
        expectedVersion: task.version,
      })
      // Refetch for updated version
      onUpdated()
      return
    }
    await updateTask(groupId, task.id, {
      title: title.trim(),
      notes: notes.trim() || null,
      dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null,
      assigneeUserId: assigneeUserId || null,
      expectedVersion: task.version,
    })
    onUpdated()
  })

  const deleteAction = useAction(async () => {
    await deleteTask(groupId, task.id, task.version)
    onDeleted()
  })

  const assignee = memberName(members, task.assigneeUserId)
  const creator = memberName(members, task.createdByUserId)
  const done = task.status === 'done'
  const overdue = !done && task.dueAt != null && new Date(task.dueAt).getTime() < Date.now()
  const meta = STATUS_META[task.status as BoardStatus] ?? STATUS_META.open

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={cn(
        'w-[min(100%,40rem)] max-w-[calc(100%-2rem)] rounded-2xl border-0 bg-surface p-0 text-ink shadow-2xl',
        'backdrop:bg-neutral-dark/60 backdrop:backdrop-blur-sm',
        /* Slide-up entrance */
        'animate-[modal-enter_250ms_cubic-bezier(0.22,1,0.36,1)_both]',
      )}
      onCancel={(e) => { e.preventDefault(); onClose() }}
    >
      <div className="flex flex-col">
        {/* Header with status color bar */}
        <div className={cn('h-1.5 rounded-t-2xl', meta.bgClass)} />

        {/* Close button */}
        <div className="flex items-start justify-between px-6 pt-4">
          <div className="flex items-center gap-2">
            {statusIcon(task.status, 'h-5 w-5')}
            <span className={cn('text-xs font-semibold uppercase tracking-wider', meta.color)}>
              {t(meta.labelKey)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <ProblemAlert message={saveAction.error != null ? mutationErrorMessage(saveAction.error) : (deleteAction.error != null ? mutationErrorMessage(deleteAction.error) : error)} />

        {/* Body */}
        <div className="space-y-5 px-6 pb-6 pt-2">
          {/* Title */}
          {isEditing ? (
            <input
              className={cn(fieldClass, 'text-lg font-bold')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          ) : (
            <h2
              className={cn(
                'text-xl font-bold text-ink',
                done && 'text-muted line-through',
                canManage && 'cursor-pointer hover:text-primary-ink transition-colors',
              )}
              onClick={() => canManage && setIsEditing(true)}
            >
              {task.title}
            </h2>
          )}

          {/* Metadata grid (Trello sidebar-style) */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {/* Status */}
            <DetailField label={t('tareas.fieldStatus')}>
              {canManage && isEditing ? (
                <select
                  className={cn(fieldClass, 'text-sm')}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {BOARD_COLUMNS.map((s) => (
                    <option key={s} value={s}>
                      {t(STATUS_META[s].labelKey)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium', meta.bgClass, meta.color)}>
                  {statusIcon(task.status, 'h-3.5 w-3.5')}
                  {t(meta.labelKey)}
                </span>
              )}
            </DetailField>

            {/* Assignee */}
            <DetailField label={t('tareas.fieldAssignee')}>
              {canManage && isEditing ? (
                <select
                  className={cn(fieldClass, 'text-sm')}
                  value={assigneeUserId}
                  onChange={(e) => setAssigneeUserId(e.target.value)}
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              ) : assignee ? (
                <span className="inline-flex items-center gap-2 text-sm text-ink">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary-ink">
                    {initials(assignee)}
                  </span>
                  {assignee}
                </span>
              ) : (
                <span className="text-sm text-muted">—</span>
              )}
            </DetailField>

            {/* Due date */}
            <DetailField label={t('tareas.fieldDue')}>
              {canManage && isEditing ? (
                <input
                  type="date"
                  className={cn(fieldClass, 'text-sm')}
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              ) : task.dueAt ? (
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-sm',
                  overdue ? 'font-medium text-error-ink' : 'text-ink',
                )}>
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                  {overdue ? `${t('tareas.overdue')} — ` : ''}
                  {formatDue(task.dueAt, lang)}
                </span>
              ) : (
                <span className="text-sm text-muted">—</span>
              )}
            </DetailField>
          </div>

          {/* Notes */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              {t('tareas.fieldNotes')}
            </p>
            {canManage && isEditing ? (
              <textarea
                className={fieldClass}
                rows={4}
                value={notes}
                maxLength={2000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('tareas.fieldNotes')}
              />
            ) : task.notes ? (
              <p
                className={cn(
                  'whitespace-pre-wrap text-sm text-ink leading-relaxed',
                  canManage && 'cursor-pointer rounded-xl p-3 hover:bg-surface-hover transition-colors',
                )}
                onClick={() => canManage && setIsEditing(true)}
              >
                {task.notes}
              </p>
            ) : (
              <p
                className={cn(
                  'text-sm text-muted italic',
                  canManage && 'cursor-pointer rounded-xl p-3 hover:bg-surface-hover transition-colors',
                )}
                onClick={() => canManage && setIsEditing(true)}
              >
                {t('tareas.fieldNotes')}
              </p>
            )}
          </div>

          {/* Created by */}
          {creator ? (
            <p className="text-xs text-muted">
              {t('tareas.createdBy')}: {creator}
            </p>
          ) : null}

          {/* Actions */}
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
              {isEditing ? (
                <>
                  <Button
                    onClick={() => void saveAction.run()}
                    disabled={saveAction.pending || !title.trim()}
                  >
                    {saveAction.pending ? t('tareas.saving') : t('tareas.save')}
                  </Button>
                  <Button variant="secondary" onClick={() => {
                    setIsEditing(false)
                    setTitle(task.title)
                    setNotes(task.notes ?? '')
                    setDueAt(task.dueAt ? task.dueAt.slice(0, 10) : '')
                    setAssigneeUserId(task.assigneeUserId ?? '')
                    setStatus(task.status)
                  }}>
                    {t('tareas.cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => setIsEditing(true)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {t('tareas.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => void deleteAction.run()}
                    disabled={deleteAction.pending}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {t('tareas.delete')}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div>{children}</div>
    </div>
  )
}

/* ─────────────── create / edit form dialog ─────────────── */

function TaskFormDialog({
  groupId,
  mode,
  task,
  members,
  onClose,
  onSaved,
}: {
  groupId: string
  mode: 'create' | 'edit'
  task?: TaskItem
  members: MemberListItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useT()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dueAt, setDueAt] = useState(task?.dueAt ? task.dueAt.slice(0, 10) : '')
  const [assigneeUserId, setAssigneeUserId] = useState(task?.assigneeUserId ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
    }
  }, [])

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
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      className={cn(
        'w-[min(100%,32rem)] max-w-[calc(100%-2rem)] rounded-2xl border-0 bg-surface p-0 text-ink shadow-2xl',
        'backdrop:bg-neutral-dark/60 backdrop:backdrop-blur-sm',
        'animate-[modal-enter_250ms_cubic-bezier(0.22,1,0.36,1)_both]',
      )}
    >
      <form
        className="space-y-4 p-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void save.run()
        }}
        noValidate
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {mode === 'create' ? t('tareas.new') : t('tareas.edit')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <ProblemAlert message={save.error != null ? mutationErrorMessage(save.error) : error} />

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('tareas.fieldTitle')}</span>
          <input
            className={fieldClass}
            value={title}
            maxLength={200}
            disabled={save.pending}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
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

        <div className="grid grid-cols-2 gap-3">
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
              <option value="">—</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.pending}>
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
