import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, ListMusic, Music2, Trash2 } from 'lucide-react'
import {
  getSetlist,
  isConflictError,
  renameSetlist,
  replaceSetlistItems,
  type CurrentUser,
  type SetlistDetail,
  type SetlistItem,
} from '../api/client'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { EmptyPanel, Field, FormActions, PageBreadcrumb, ReadinessChip } from '../repertoire/chrome'
import {
  CONFLICT_MESSAGE,
  ConflictAlert,
  canManageContentRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import {
  formatArrangementOption,
  loadLiveArrangementOptions,
  type LiveArrangementOption,
} from './liveArrangements'
import { useT, type I18nKey } from '../i18n'
import { plural } from '../ui/plural'

type DraftItem = {
  key: string
  arrangementId: string
  sortOrder: number
  songTitle: string
  arrangementLabel: string
}

function toDraft(
  items: SetlistItem[],
  t: (key: I18nKey) => string,
): DraftItem[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({
      key: item.id,
      arrangementId: item.arrangementId,
      sortOrder: index + 1,
      songTitle: item.songTitle ?? t('lista.unknownSong'),
      arrangementLabel: item.arrangementLabel ?? t('lista.unknownArrangement'),
    }))
}

function SetlistNumber({ n }: { n: number }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-hover font-mono text-sm font-semibold text-muted">
      {String(n).padStart(2, '0')}
    </span>
  )
}

function SortableSetlistItem({
  item,
  index,
  isLast,
  isOwner,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: DraftItem
  index: number
  isLast: boolean
  isOwner: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const { t } = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="library-enter flex min-h-[44px] flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-3 shadow-sm transition duration-150 hover:border-primary/25 hover:bg-surface-hover motion-reduce:transition-none sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:first:rounded-t-2xl sm:last:rounded-b-2xl"
    >
      <SetlistNumber n={item.sortOrder} />
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"
        aria-hidden="true"
      >
        <Music2 className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{item.songTitle}</span>
        <span className="text-sm text-muted">{item.arrangementLabel}</span>
      </span>
      {isOwner ? (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="grid h-9 w-9 cursor-grab items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:cursor-grabbing"
            aria-label={`${t('lista.dragPrefix')}${item.sortOrder}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <Button
            variant="secondary"
            size="sm"
            disabled={index === 0}
            aria-label={`${t('lista.moveUpPrefix')}${item.sortOrder}`}
            onClick={onMoveUp}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('lista.moveUp')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={isLast}
            aria-label={`${t('lista.moveDownPrefix')}${item.sortOrder}`}
            onClick={onMoveDown}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('lista.moveDown')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${t('lista.removePrefix')}${item.sortOrder}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('lista.remove')}</span>
          </Button>
        </div>
      ) : null}
    </li>
  )
}

export function SetlistDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, setlistId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [setlist, setSetlist] = useState<SetlistDetail | null | undefined>(undefined)
  const [draft, setDraft] = useState<DraftItem[]>([])
  const [options, setOptions] = useState<LiveArrangementOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedArrangementId, setSelectedArrangementId] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const { t } = useT()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const isOwner = canManageContentRole(group?.role)

  async function reload() {
    if (!groupId || !setlistId) return
    const [nextSetlist, nextOptions] = await Promise.all([
      getSetlist(groupId, setlistId),
      loadLiveArrangementOptions(groupId),
    ])
    setSetlist(nextSetlist)
    setDraft(toDraft(nextSetlist.items, t))
    setOptions(nextOptions)
    if (nextOptions[0] && !selectedArrangementId) {
      setSelectedArrangementId(nextOptions[0].arrangementId)
    }
  }

  useEffect(() => {
    if (!groupId || !setlistId || !group) return
    let cancelled = false
    async function load() {
      setSetlist(undefined)
      setError(null)
      setConflict(null)
      try {
        const [nextSetlist, nextOptions] = await Promise.all([
          getSetlist(groupId!, setlistId!),
          loadLiveArrangementOptions(groupId!),
        ])
        if (cancelled) return
        setSetlist(nextSetlist)
        setDraft(toDraft(nextSetlist.items, t))
        setOptions(nextOptions)
        setSelectedArrangementId(nextOptions[0]?.arrangementId ?? '')
      } catch (err) {
        if (cancelled) return
        setSetlist(null)
        setOptions([])
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, setlistId, group])

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    const current = next[index]
    const swapped = next[target]
    if (!current || !swapped) return
    next[index] = swapped
    next[target] = current
    setDraft(next.map((item, i) => ({ ...item, sortOrder: i + 1 })))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = draft.findIndex((item) => item.key === active.id)
    const newIndex = draft.findIndex((item) => item.key === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    setDraft((items) =>
      arrayMove(items, oldIndex, newIndex).map((item, i) => ({ ...item, sortOrder: i + 1 })),
    )
  }

  function addSelectedArrangement() {
    const option = options?.find((item) => item.arrangementId === selectedArrangementId)
    if (!option) return
    setDraft((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        arrangementId: option.arrangementId,
        sortOrder: current.length + 1,
        songTitle: option.songTitle,
        arrangementLabel: option.arrangementLabel,
      },
    ])
    setShowAdd(true)
  }

  function removeItem(key: string) {
    setDraft((current) =>
      current.filter((item) => item.key !== key).map((item, i) => ({ ...item, sortOrder: i + 1 })),
    )
  }

  async function saveItems() {
    if (!groupId || !setlistId || !setlist) return
    setSaving(true)
    setError(null)
    setConflict(null)
    try {
      const updated = await replaceSetlistItems(
        groupId,
        setlistId,
        setlist.version,
        draft.map((item, index) => ({
          arrangementId: item.arrangementId,
          sortOrder: index + 1,
        })),
      )
      setSetlist(updated)
      setDraft(toDraft(updated.items, t))
    } catch (err) {
      if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        try {
          await reload()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr))
        }
      } else {
        setError(mutationErrorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">{t('lista.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          Mis grupos
        </Link>
      </div>
    )
  }

  if (setlist === undefined) {
    return <p aria-live="polite">{t('lista.loading')}</p>
  }

  if (setlist === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? t('lista.notFound')} />
        <Link
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={`/groups/${group.id}/setlists`}
        >
          {t('lista.setlists')}
        </Link>
      </div>
    )
  }

  const addPanelOpen = isOwner && (showAdd || draft.length === 0)

  return (
    <section className="space-y-6" aria-labelledby="setlist-heading">
      <header data-testid="setlist-hero" className="space-y-3">
        <PageBreadcrumb
          items={[
            { to: `/groups/${group.id}`, label: group.name },
            { to: `/groups/${group.id}/setlists`, label: t('agenda.setlistsTitle') },
            { label: setlist.name },
          ]}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-ink"
              aria-hidden="true"
            >
              <ListMusic className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h1 id="setlist-heading" className="text-3xl font-bold tracking-tight text-ink">
                {setlist.name}
              </h1>
              <p className="text-sm text-muted">
                {plural(draft.length, t('common.songOne'), t('common.songMany'))}
                {!isOwner ? <span> · {t('lista.readonly')}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReadinessChip
              tone={draft.length === 0 ? 'neutral' : 'ok'}
              testId="setlist-status-chip"
            >
              {draft.length === 0
                ? t('agenda.setlistVacant')
                : plural(
                    draft.length,
                    t('agenda.setlistArrangementsOne'),
                    t('agenda.setlistArrangementsMany'),
                  )}
            </ReadinessChip>
            {isOwner ? (
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => void saveItems()}
              >
                {saving ? t('lista.saving') : t('lista.saveOrder')}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="space-y-4" aria-labelledby="composition-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="composition-heading" className="text-lg font-semibold">
              {t('lista.composition')}
            </h2>
            {isOwner && draft.length > 0 && !showAdd ? (
              <Button variant="ghost" onClick={() => setShowAdd(true)}>
                {t('lista.addToList')}
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted">
            {t('lista.compositionHint')}
          </p>

          {draft.length === 0 ? (
            <EmptyPanel
              title={t('agenda.emptySetlistTitle')}
              description={
                isOwner
                  ? t('lista.emptyOwner')
                  : t('lista.emptyMember')
              }
            />
          ) : (
            <div className="space-y-1">
              <div
                aria-hidden="true"
                className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
              >
                <span>{t('lista.colNumber')}</span>
                <span>{t('lista.colArrangement')}</span>
                <span>{t('lista.colActions')}</span>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={draft.map((item) => item.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="space-y-2 sm:space-y-0 sm:divide-y sm:divide-border-subtle sm:rounded-2xl sm:border sm:border-border-subtle sm:bg-surface">
                    {draft.map((item, index) => (
                      <SortableSetlistItem
                        key={item.key}
                        item={item}
                        index={index}
                        isLast={index === draft.length - 1}
                        isOwner={isOwner}
                        onMoveUp={() => moveItem(index, -1)}
                        onMoveDown={() => moveItem(index, 1)}
                        onRemove={() => removeItem(item.key)}
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {addPanelOpen ? (
            <div className="max-w-md space-y-3 rounded-2xl border border-border-subtle bg-surface-hover p-4">
              {options === null ? (
                <p aria-live="polite">{t('lista.loadingArrangements')}</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted">
                  {t('lista.noOptions')}
                </p>
              ) : (
                <>
                  <Field label={t('lista.arrangementLabel')}>
                    <select
                      className={fieldClass}
                      value={selectedArrangementId}
                      onChange={(e) => setSelectedArrangementId(e.target.value)}
                    >
                      {options.map((option) => (
                        <option key={option.arrangementId} value={option.arrangementId}>
                          {formatArrangementOption(option)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <FormActions>
                    <Button onClick={addSelectedArrangement}>{t('lista.addToList')}</Button>
                    {draft.length > 0 ? (
                      <Button variant="secondary" onClick={() => setShowAdd(false)}>
                        {t('lista.cancel')}
                      </Button>
                    ) : null}
                  </FormActions>
                </>
              )}
            </div>
          ) : null}
        </section>

        <aside className="space-y-4 rounded-2xl bg-surface-hover p-5">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
            {t('lista.detailsTitle')}
          </h2>
          {renaming && isOwner ? (
            <RenameSetlistForm
              groupId={group.id}
              setlist={setlist}
              onCancel={() => setRenaming(false)}
              onSaved={(next) => {
                setSetlist(next)
                setRenaming(false)
                setConflict(null)
              }}
              onConflict={async () => {
                setConflict(CONFLICT_MESSAGE)
                setRenaming(false)
                try {
                  await reload()
                } catch (err) {
                  setError(mutationErrorMessage(err))
                }
              }}
            />
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">{t('lista.nameLabel')}</dt>
                <dd className="font-medium text-ink">{setlist.name}</dd>
              </div>
            </dl>
          )}

          {!renaming ? (
            <p className="text-xs text-muted">
              {t('lista.readyHint')}
            </p>
          ) : null}

          {isOwner && !renaming ? (
            <Button variant="secondary" onClick={() => setRenaming(true)}>
              {t('lista.rename')}
            </Button>
          ) : null}
        </aside>
      </div>
    </section>
  )
}

function RenameSetlistForm({
  groupId,
  setlist,
  onCancel,
  onSaved,
  onConflict,
}: {
  groupId: string
  setlist: SetlistDetail
  onCancel: () => void
  onSaved: (setlist: SetlistDetail) => void
  onConflict: () => Promise<void>
}) {
  const { t } = useT()
  const [name, setName] = useState(setlist.name)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const updated = await renameSetlist(groupId, setlist.id, setlist.version, name.trim())
      onSaved(updated)
    } catch (err) {
      if (isConflictError(err)) {
        await onConflict()
      } else {
        setError(mutationErrorMessage(err))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit} noValidate>
      <p className="text-xs text-muted">{t('lista.renameHint')}</p>
      <ProblemAlert message={error} />
      <Field label={t('lista.nameLabel')}>
        <input
          className={fieldClass}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? t('lista.saving') : t('lista.saveName')}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={onCancel}>
          {t('lista.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}
