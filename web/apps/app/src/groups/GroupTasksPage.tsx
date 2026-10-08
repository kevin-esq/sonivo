import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode, KeyboardEvent } from 'react'
import { useParams } from 'react-router-dom'
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { canManageContentRole, mutationErrorMessage, ProblemAlert } from '../repertoire/ui'
import { useAction } from '../hooks/useAction'
import { useResource } from '../hooks/useResource'
import { useAuth } from '../shell/authContext'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { CreateTaskDialog } from './dialogs'
import {
  GroupButton,
  GroupChip,
  GroupEmptyState,
  GroupErrorState,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  GroupPageSkeleton,
  useGroupDataSignal,
} from './ui'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

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
    labelKey: 'tasks.statusOpen',
    columnKey: 'tasks.boardNotStarted',
    color: 'text-muted',
    bgClass: 'bg-surface-hover/60',
    iconColor: 'text-muted',
  },
  in_progress: {
    labelKey: 'tasks.statusInProgress',
    columnKey: 'tasks.boardInProgress',
    color: 'text-primary-ink',
    bgClass: 'bg-primary/10',
    iconColor: 'text-primary-ink',
  },
  done: {
    labelKey: 'tasks.statusDone',
    columnKey: 'tasks.boardDone',
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

/** Convert ISO string to local date input value (YYYY-MM-DD) without UTC shift. */
function toLocalDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

type TaskFilter = 'all' | 'open' | 'done' | 'mine' | 'overdue'

/* ─────────────── main page ─────────────── */

/**
 * W-G — group tasks (`/groups/:id/tasks`). Manager/Owner create/edit/complete; Member reads.
 */
export function GroupTasksPage() {
  const { groupId } = useParams()
  const { t, lang } = useT()
  const { user } = useAuth()
  const [group, setGroup] = useState<Awaited<ReturnType<typeof getGroup>> | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [view, setView] = useState<'list' | 'board'>('board')
  const [showCreate, setShowCreate] = useState(false)
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [localTasks, setLocalTasks] = useState<TaskItem[] | null>(null)
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)
  const statusQueueRef = useRef<Map<string, Promise<TaskItem>>>(new Map())

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

  // Shared real-time updates: poll every 30s to reflect other users' changes
  useEffect(() => {
    if (!groupId || !group) return
    const interval = setInterval(() => {
      setReloadKey((k) => k + 1)
    }, 30000)
    return () => clearInterval(interval)
  }, [groupId, group])

  const membersSurface = useResource(
    group && groupId ? () => listMembers(groupId!) : null,
    [groupId, group],
  )
  const members = membersSurface.data ?? []

  const tasks = localTasks ?? surface.data ?? []
  const visible = useMemo(
    () => {
      let filtered = tasks
      if (filter === 'done') filtered = filtered.filter((task) => task.status === 'done')
      else if (filter === 'open') filtered = filtered.filter((task) => task.status !== 'done')
      else if (filter === 'mine') filtered = filtered.filter((task) => task.assigneeUserId === user?.id)
      else if (filter === 'overdue') filtered = filtered.filter((task) => {
        if (task.status === 'done' || !task.dueAt) return false
        return new Date(task.dueAt).getTime() < Date.now()
      })
      return filtered
    },
    [tasks, filter, user?.id],
  )

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // Live refresh when tasks change elsewhere (creation dialogs, inline edits).
  useGroupDataSignal('tasks', groupId, reload)

  const [confirmDelete, setConfirmDelete] = useState<TaskItem | null>(null)

  const doneCount = tasks.filter((x) => x.status === 'done').length

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (group === undefined) {
    return <GroupPageSkeleton label={t('tasks.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={error} />
        <GroupLink variant="secondary" to="/">
          {t('workspace.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const canManage = canManageContentRole(group.role)

  async function changeStatus(task: TaskItem, status: string) {
    if (!groupId) return
    const list = localTasks ?? surface.data ?? []
    // Optimistic update: move card immediately in local state
    setLocalTasks(list.map((t) => t.id === task.id ? { ...t, status } : t))
    // Chain after any in-flight change for this task
    const prior = statusQueueRef.current.get(task.id) ?? Promise.resolve(task)
    const next = prior.then(() => setTaskStatus(groupId, task.id, {
      status,
      expectedVersion: task.version,
    }))
    statusQueueRef.current.set(task.id, next)
    try {
      const result = await next
      // Apply server response (new status + new version) to local list
      const current = localTasks ?? surface.data ?? []
      setLocalTasks(current.map((t) => t.id === task.id ? { ...t, status: result.status, version: result.version } : t))
    } catch (err) {
      // Revert only this task, not the whole list
      const current = localTasks ?? surface.data ?? []
      setLocalTasks(current.map((t) => t.id === task.id ? { ...t, status: task.status, version: task.version } : t))
      setError(mutationErrorMessage(err))
    } finally {
      // Clean up queue entry if it's still the latest
      if (statusQueueRef.current.get(task.id) === next) {
        statusQueueRef.current.delete(task.id)
      }
    }
  }

  async function remove(task: TaskItem) {
    if (!groupId) return
    setConfirmDelete(task)
  }

  return (
    <DndContext
      sensors={dndSensors}
      onDragStart={(event: DragStartEvent) => {
        const task = tasks.find((x) => x.id === event.active.id)
        setActiveTask(task ?? null)
        if (canManage && 'vibrate' in navigator) navigator.vibrate(50)
      }}
      onDragOver={(event: DragEndEvent) => {
        setOverColumn((event.over?.id as string) ?? null)
      }}
      onDragEnd={(event: DragEndEvent) => {
        const { active, over } = event
        setActiveTask(null)
        setOverColumn(null)
        if (!over) return
        const task = tasks.find((x) => x.id === active.id)
        const newStatus = over.id as BoardStatus
        if (!task || task.status === newStatus) return
        void changeStatus(task, newStatus)
      }}
      onDragCancel={() => { setActiveTask(null); setOverColumn(null) }}
    >
    <section className="space-y-4" aria-labelledby="tasks-heading">
      <GroupPageHeader
        headingId="tasks-heading"
        title={t('tasks.title')}
        subtitle={t('tasks.subtitle')}
        actions={
          canManage ? (
            <GroupButton onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('tasks.new')}
            </GroupButton>
          ) : null
        }
      >
        {/* Progress bar */}
        {tasks.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-muted" aria-live="polite">
              {t('tasks.progress', { done: doneCount, total: tasks.length })}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={tasks.length}>
              <div
                className="h-full rounded-full bg-success transition-all duration-500"
                style={{ width: `${(doneCount / tasks.length) * 100}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* View toggle: List / Board */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 rounded-xl bg-surface-hover/50 p-1" role="group" aria-label={t('tasks.title')}>
            {([
              { id: 'board', label: t('tasks.viewBoard') },
              { id: 'list', label: t('tasks.viewList') },
            ] as { id: 'list' | 'board'; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={view === tab.id}
                onClick={() => setView(tab.id)}
                className={cn(
                  'min-h-11 rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  view === tab.id
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-muted hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('tasks.filterLabel')}>
            {([
              { id: 'all', label: t('tasks.filterAll') },
              { id: 'open', label: t('tasks.filterOpen') },
              { id: 'done', label: t('tasks.filterDone') },
              { id: 'mine', label: t('tasks.filterMine') },
              { id: 'overdue', label: t('tasks.filterOverdue') },
            ] as { id: TaskFilter; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={cn(
                  'min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  filter === tab.id
                    ? 'bg-primary-strong text-primary-foreground'
                    : 'text-muted hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </GroupPageHeader>

      <GroupErrorState message={error} />

      {surface.loading && tasks.length === 0 ? (
        <GroupListSkeleton rows={3} label={t('tasks.loading')} />
      ) : visible.length === 0 && view === 'list' ? (
        <GroupEmptyState
          icon={CheckCircle2}
          title={t('tasks.emptyTitle')}
          description={t('tasks.emptyBody')}
        />
      ) : view === 'board' ? (
        <TaskBoard
          tasks={visible}
          members={members}
          canManage={canManage}
          activeTask={activeTask}
          overColumn={overColumn}
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
        <CreateTaskDialog
          groupId={group.id}
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
          onStatusChange={(task, status) => void changeStatus(task, status)}
          t={t}
          lang={lang}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('tasks.deleteConfirmTitle')}
        message={t('tasks.deleteConfirm')}
        confirmLabel={t('tasks.delete')}
        cancelLabel={t('tasks.cancel')}
        onConfirm={() => {
          if (confirmDelete) {
            void (async () => {
              try {
                await deleteTask(group.id, confirmDelete.id, confirmDelete.version)
                setConfirmDelete(null)
                reload()
              } catch (err) {
                setError(mutationErrorMessage(err))
              }
            })()
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
    </DndContext>
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
                aria-label={done ? t('tasks.reopen') : t('tasks.complete')}
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
                <GroupChip
                  tone={
                    task.status === 'done'
                      ? 'success'
                      : task.status === 'in_progress'
                        ? 'accent'
                        : 'neutral'
                  }
                >
                  {t(STATUS_META[task.status as BoardStatus]?.labelKey ?? 'tasks.statusOpen')}
                </GroupChip>
                {task.dueAt ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      overdue && 'font-medium text-error-ink',
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {overdue ? t('tasks.overdue') : t('tasks.dueLabel')}{' '}
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
                  aria-label={`${t('tasks.edit')}: ${task.title}`}
                  className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(task)}
                  aria-label={`${t('tasks.delete')}: ${task.title}`}
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
  activeTask,
  overColumn,
  onCardClick,
  t,
  lang,
}: {
  tasks: TaskItem[]
  members: MemberListItem[]
  canManage: boolean
  activeTask: TaskItem | null
  overColumn: string | null
  onCardClick: (task: TaskItem) => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const normalizedColumns = useMemo(() => {
    return BOARD_COLUMNS.map((status) => ({
      id: status,
      title: t(STATUS_META[status].columnKey),
      tasks: tasks.filter((x) => {
        if (status === 'open') return x.status === 'open' || !BOARD_COLUMNS.includes(x.status as BoardStatus)
        return x.status === status
      }).sort((a, b) => {
        if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
        if (a.dueAt) return -1
        if (b.dueAt) return 1
        return 0
      }),
    }))
  }, [tasks, t])

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
            activeTaskId={activeTask?.id ?? null}
            onCardClick={onCardClick}
            t={t}
            lang={lang}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCardOverlay task={activeTask} members={members} t={t} lang={lang} />
        ) : null}
      </DragOverlay>
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
  activeTaskId,
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
  activeTaskId: string | null
  onCardClick: (task: TaskItem) => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const meta = STATUS_META[id as BoardStatus] ?? STATUS_META.open
  const { setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[200px] flex-col rounded-2xl transition-all duration-200',
        'bg-surface-hover/20 border',
        isOver
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
          : 'border-border-subtle',
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-3">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg', meta.bgClass)} aria-hidden="true">
          {statusIcon(id, 'h-3.5 w-3.5')}
        </span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
          {title}
        </h3>
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
            {isOver ? t('tasks.dropHere') : t('tasks.noTasks')}
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCardDnd
              key={task.id}
              task={task}
              members={members}
              canManage={canManage}
              isDragging={activeTaskId === task.id}
              onClick={() => onCardClick(task)}
              onMove={(dir) => {
                const currentIdx = BOARD_COLUMNS.indexOf(task.status as BoardStatus)
                const newIdx = dir === 'left' ? currentIdx - 1 : currentIdx + 1
                if (newIdx >= 0 && newIdx < BOARD_COLUMNS.length) {
                  // Status change is now handled by DndContext at the top level
                  // This callback is kept for keyboard navigation (Alt+Arrow)
                }
              }}
              t={t}
              lang={lang}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ─── card ─── */

function TaskCardDnd({
  task,
  members,
  canManage,
  isDragging,
  onClick,
  onMove,
  t,
  lang,
}: {
  task: TaskItem
  members: MemberListItem[]
  canManage: boolean
  isDragging: boolean
  onClick: () => void
  onMove: (dir: 'left' | 'right') => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isDragActive } = useDraggable({
    id: task.id,
    disabled: !canManage,
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <TaskCard
      task={task}
      members={members}
      canManage={canManage}
      isDragging={isDragging || isDragActive}
      onClick={onClick}
      onMove={onMove}
      t={t}
      lang={lang}
      dndRef={setNodeRef}
      dndStyle={style}
      dndListeners={canManage ? listeners : undefined}
      dndAttributes={canManage ? attributes : undefined}
    />
  )
}

function TaskCard({
  task,
  members,
  canManage,
  isDragging,
  onClick,
  onMove,
  t,
  lang,
  dndRef,
  dndStyle,
  dndListeners,
  dndAttributes,
}: {
  task: TaskItem
  members: MemberListItem[]
  canManage: boolean
  isDragging: boolean
  onClick: () => void
  onMove: (dir: 'left' | 'right') => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
  dndRef?: React.Ref<HTMLElement>
  dndStyle?: React.CSSProperties
  dndListeners?: Record<string, unknown>
  dndAttributes?: object
}) {
  const done = task.status === 'done'
  const overdue = !done && task.dueAt != null && new Date(task.dueAt).getTime() < Date.now()
  const dueSoon = !done && task.dueAt != null && !overdue && new Date(task.dueAt).getTime() - Date.now() < 48 * 60 * 60 * 1000
  const assignee = memberName(members, task.assigneeUserId)

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
    if (canManage && e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault()
      onMove('left')
      requestAnimationFrame(() => {
        ;(document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement | null)?.focus()
      })
    }
    if (canManage && e.altKey && e.key === 'ArrowRight') {
      e.preventDefault()
      onMove('right')
      requestAnimationFrame(() => {
        ;(document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement | null)?.focus()
      })
    }
  }

  return (
    <article
      ref={dndRef as React.Ref<HTMLElement>}
      data-task-id={task.id}
      style={dndStyle}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={task.title}
      aria-describedby={task.dueAt ? `due-${task.id}` : undefined}
      {...(dndListeners ? { ...dndListeners } : {})}
      {...(dndAttributes ? { ...dndAttributes } : {})}
      className={cn(
        'group relative cursor-pointer rounded-xl border border-border-subtle bg-surface p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200',
        'hover:border-primary/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.06)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        canManage && (isDragging ? 'cursor-grabbing' : 'cursor-grab'),
        isDragging && 'opacity-0',
      )}
    >
      {/* Move buttons (mobile + hover + focus-within) */}
      {canManage ? (
        <div className="absolute -top-2 right-2 flex gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove('left') }}
            disabled={task.status === 'open'}
            aria-label={t('tasks.moveTo', { status: t(STATUS_META[BOARD_COLUMNS[BOARD_COLUMNS.indexOf(task.status as BoardStatus) - 1] ?? 'open'].columnKey) })}
            className="grid h-11 w-11 place-items-center rounded-full bg-surface text-muted shadow-sm hover:text-ink disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove('right') }}
            disabled={task.status === 'done'}
            aria-label={t('tasks.moveTo', { status: t(STATUS_META[BOARD_COLUMNS[BOARD_COLUMNS.indexOf(task.status as BoardStatus) + 1] ?? 'done'].columnKey) })}
            className="grid h-11 w-11 place-items-center rounded-full bg-surface text-muted shadow-sm hover:text-ink disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

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
            id={`due-${task.id}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
              overdue
                ? 'bg-error/10 text-error-ink'
                : dueSoon
                  ? 'bg-warning/10 text-warning'
                  : done
                    ? 'bg-success/10 text-success'
                    : 'bg-surface-hover text-muted',
            )}
          >
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            {overdue ? `${t('tasks.overdue')} — ${formatDue(task.dueAt, lang)}` : formatDue(task.dueAt, lang)}
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
    </article>
  )
}

function TaskCardOverlay({
  task,
  members,
  t,
  lang,
}: {
  task: TaskItem
  members: MemberListItem[]
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const done = task.status === 'done'
  const overdue = !done && task.dueAt != null && new Date(task.dueAt).getTime() < Date.now()
  const assignee = memberName(members, task.assigneeUserId)

  return (
    <article className="cursor-grabbing rotate-[3deg] scale-105 rounded-xl border border-border-subtle bg-surface p-3 opacity-90 shadow-[0_12px_32px_rgba(0,0,0,0.2),0_4px_8px_rgba(0,0,0,0.1)] ring-2 ring-primary/30">
      <p className={cn('text-sm font-semibold text-ink leading-snug', done && 'text-muted line-through')}>
        {task.title}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        {task.dueAt ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
              overdue ? 'bg-error/10 text-error-ink' : done ? 'bg-success/10 text-success' : 'bg-surface-hover text-muted',
            )}
          >
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            {overdue ? `${t('tasks.overdue')} — ${formatDue(task.dueAt, lang)}` : formatDue(task.dueAt, lang)}
          </span>
        ) : null}
        {assignee ? (
          <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary-ink">
            {initials(assignee)}
          </span>
        ) : null}
      </div>
    </article>
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
  onStatusChange,
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
  onStatusChange: (task: TaskItem, status: string) => void
  t: (key: I18nKey, params?: TParams) => string
  lang: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [dueAt, setDueAt] = useState(toLocalDate(task.dueAt))
  const [assigneeUserId, setAssigneeUserId] = useState(task.assigneeUserId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
    }
  }, [])

  // Compute hasChanges directly in render — no state, no effect
  const hasChanges = isEditing && (
    title !== task.title ||
    notes !== (task.notes ?? '') ||
    dueAt !== toLocalDate(task.dueAt) ||
    assigneeUserId !== (task.assigneeUserId ?? '')
  )

  // Close on click outside
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const d = dialog
    function handleClick(e: MouseEvent) {
      // Only close if clicking the dialog backdrop itself, not children
      if (e.target === d) {
        if (hasChanges) {
          setConfirmDiscard(true)
        } else {
          onClose()
        }
      }
    }
    dialog.addEventListener('click', handleClick)
    return () => dialog.removeEventListener('click', handleClick)
  }, [hasChanges, onClose])

  const saveAction = useAction(async () => {
    setError(null)
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

  // Ctrl/Cmd + Enter saves (Esc is handled by onCancel)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    function handleKeydown(e: Event) {
      const ke = e as globalThis.KeyboardEvent
      if ((ke.ctrlKey || ke.metaKey) && ke.key === 'Enter' && isEditing) {
        ke.preventDefault()
        void saveAction.run()
      }
    }
    dialog.addEventListener('keydown', handleKeydown)
    return () => dialog.removeEventListener('keydown', handleKeydown)
  }, [isEditing, saveAction])

  const assignee = memberName(members, task.assigneeUserId)
  const creator = memberName(members, task.createdByUserId)
  const done = task.status === 'done'
  const overdue = !done && task.dueAt != null && new Date(task.dueAt).getTime() < Date.now()
  const meta = STATUS_META[task.status as BoardStatus] ?? STATUS_META.open

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
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
            aria-label={t('tasks.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <ProblemAlert message={saveAction.error != null ? mutationErrorMessage(saveAction.error) : (deleteAction.error != null ? mutationErrorMessage(deleteAction.error) : error)} />

        {/* Body */}
        <div className="space-y-5 px-6 pb-6 pt-2">
          {/* Title */}
          {isEditing ? (
            <div>
              <label htmlFor={`${titleId}-title`} className="sr-only">{t('tasks.fieldTitle')}</label>
              <input
                id={`${titleId}-title`}
                className={cn(fieldClass, 'text-lg font-bold')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </div>
          ) : (
            <h2
              id={titleId}
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
            <DetailField label={t('tasks.fieldStatus')}>
              {canManage ? (
                <div className="flex gap-1" role="group" aria-label={t('tasks.fieldStatus')}>
                  {BOARD_COLUMNS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={task.status === s}
                      onClick={() => {
                        if (task.status !== s) {
                          onStatusChange(task, s)
                        }
                      }}
                      className={cn(
                        'min-h-8 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                        task.status === s
                          ? cn(STATUS_META[s].bgClass, STATUS_META[s].color)
                          : 'text-muted hover:text-ink',
                      )}
                    >
                      {t(STATUS_META[s].labelKey)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium', meta.bgClass, meta.color)}>
                  {statusIcon(task.status, 'h-3.5 w-3.5')}
                  {t(meta.labelKey)}
                </span>
              )}
            </DetailField>

            {/* Assignee */}
            <DetailField label={t('tasks.fieldAssignee')}>
              {canManage && isEditing ? (
                <select
                  className={cn(fieldClass, 'text-sm')}
                  value={assigneeUserId}
                  onChange={(e) => setAssigneeUserId(e.target.value)}
                >
                  <option value="">—</option>
                  {members.filter((m) => m.userId).map((m) => (
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
            <DetailField label={t('tasks.fieldDue')}>
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
                  {overdue ? `${t('tasks.overdue')} — ` : ''}
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
              {t('tasks.fieldNotes')}
            </p>
            {canManage && isEditing ? (
              <textarea
                className={fieldClass}
                rows={4}
                value={notes}
                maxLength={2000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('tasks.addNotes')}
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
                {t('tasks.addNotes')}
              </p>
            )}
          </div>

          {/* Created by */}
          {creator ? (
            <p className="text-xs text-muted">
              {t('tasks.createdBy')}: {creator}
            </p>
          ) : null}

          {/* Actions */}
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
              {isEditing ? (
                <>
                  <GroupButton
                    onClick={() => void saveAction.run()}
                    disabled={saveAction.pending || !title.trim()}
                  >
                    {saveAction.pending ? t('tasks.saving') : t('tasks.save')}
                  </GroupButton>
                  <GroupButton variant="secondary" onClick={() => {
                    setIsEditing(false)
                    setTitle(task.title)
                    setNotes(task.notes ?? '')
                    setDueAt(toLocalDate(task.dueAt))
                    setAssigneeUserId(task.assigneeUserId ?? '')
                  }}>
                    {t('tasks.cancel')}
                  </GroupButton>
                </>
              ) : (
                <>
                  <GroupButton variant="secondary" onClick={() => setIsEditing(true)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {t('tasks.edit')}
                  </GroupButton>
                  <GroupButton
                    variant="danger"
                    onClick={() => void deleteAction.run()}
                    disabled={deleteAction.pending}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {t('tasks.delete')}
                  </GroupButton>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title={t('tasks.discardConfirmTitle')}
        message={t('tasks.discardConfirm')}
        confirmLabel={t('tasks.discard')}
        cancelLabel={t('tasks.cancel')}
        onConfirm={() => {
          setConfirmDiscard(false)
          setIsEditing(false)
          onClose()
        }}
        onCancel={() => setConfirmDiscard(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('tasks.deleteConfirmTitle')}
        message={t('tasks.deleteConfirm')}
        confirmLabel={t('tasks.delete')}
        cancelLabel={t('tasks.cancel')}
        onConfirm={() => {
          setConfirmDelete(false)
          void deleteAction.run()
        }}
        onCancel={() => setConfirmDelete(false)}
      />
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

