import { routes } from '../routing/routes'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  defaultAnimateLayoutChanges,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ChevronDown, ChevronRight, ChevronUp, GripVertical, ListMusic, Music2, Plus, Search, Trash2 } from 'lucide-react'
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
import { AppLink } from '../routing/AppLink'
import { GroupDialog } from '../groups/ui'

type DraftItem = {
  key: string
  arrangementId: string
  sortOrder: number
  songTitle: string
  arrangementLabel: string
}

function groupArrangementOptions(options: LiveArrangementOption[], search: string) {
  const query = search.trim().toLocaleLowerCase()
  const groups = new Map<string, LiveArrangementOption[]>()
  for (const option of options) {
    if (query && !formatArrangementOption(option).toLocaleLowerCase().includes(query)) continue
    groups.set(option.songId, [...(groups.get(option.songId) ?? []), option])
  }
  return [...groups.entries()].map(([songId, arrangements]) => ({ songId, arrangements }))
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
      songTitle: item.songTitle ?? t('setlist.unknownSong'),
      arrangementLabel: item.arrangementLabel ?? t('setlist.unknownArrangement'),
    }))
}

function SetlistNumber({ n }: { n: number }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-score-hover)] font-mono text-sm font-semibold text-[var(--color-score-ink-soft)]">
      {String(n).padStart(2, '0')}
    </span>
  )
}

function SortableSetlistItem({
  item,
  index,
  displayNumber,
  isLast,
  isOwner,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: DraftItem
  index: number
  displayNumber: number
  isLast: boolean
  isOwner: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const { t } = useT()
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
    animateLayoutChanges: defaultAnimateLayoutChanges,
    transition: { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : (transition ?? 'transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)'),
    opacity: isDragging ? 0.94 : 1,
    scale: isDragging ? '1.02' : '1',
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-setlist-item={item.key}
      className={`relative flex min-h-[68px] flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-ink transition-colors hover:border-primary/30 hover:bg-surface-hover/60 motion-reduce:transition-none sm:min-h-20 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3 ${isDragging ? 'ring-2 ring-primary/35 shadow-lg' : ''}`}
    >
      <SetlistNumber n={displayNumber} />
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary-ink"
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
            ref={setActivatorNodeRef}
            className="grid h-11 w-11 touch-none cursor-grab items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:cursor-grabbing sm:h-9 sm:w-9"
            aria-label={`${t('setlist.dragPrefix')}${item.sortOrder}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <Button
            variant="secondary"
            size="sm"
            className="h-11 w-11 px-0 sm:h-9 sm:w-9 sm:px-3"
            disabled={index === 0}
            aria-label={`${t('setlist.moveUpPrefix')}${item.sortOrder}`}
            onClick={onMoveUp}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('setlist.moveUp')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-11 w-11 px-0 sm:h-9 sm:w-9 sm:px-3"
            disabled={isLast}
            aria-label={`${t('setlist.moveDownPrefix')}${item.sortOrder}`}
            onClick={onMoveDown}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('setlist.moveDown')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 w-11 px-0 sm:h-9 sm:w-9 sm:px-3"
            aria-label={`${t('setlist.removePrefix')}${item.sortOrder}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('setlist.remove')}</span>
          </Button>
        </div>
      ) : null}
    </li>
  )
}

export function SetlistDetailPage({ user, groupId, setlistId }: { user: CurrentUser; groupId: string; setlistId: string }) {
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [setlist, setSetlist] = useState<SetlistDetail | null | undefined>(undefined)
  const [draft, setDraft] = useState<DraftItem[]>([])
  const [options, setOptions] = useState<LiveArrangementOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [arrangementSearch, setArrangementSearch] = useState('')
  const [selectedArrangementIds, setSelectedArrangementIds] = useState<string[]>([])
  const [selectedAudioResourceIds, setSelectedAudioResourceIds] = useState<Record<string, string>>({})
  const [configurationSongId, setConfigurationSongId] = useState<string | null>(null)
  const [configurationArrangementId, setConfigurationArrangementId] = useState<string | null>(null)
  const [configurationAudioResourceId, setConfigurationAudioResourceId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<{ activeId: string; overId: string | null } | null>(null)
  const previousItemRects = useRef(new Map<string, DOMRect>())
  const skipNextLayoutAnimation = useRef(false)
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
      } catch (err) {
        if (cancelled) return
        setSetlist(null)
        setOptions([])
        setError(mutationErrorMessage(err, t))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, setlistId, group])

  useLayoutEffect(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-setlist-item]')]
    const nextRects = new Map(rows.map((row) => [row.dataset.setlistItem!, row.getBoundingClientRect()]))
    const skipAnimation = skipNextLayoutAnimation.current
    skipNextLayoutAnimation.current = false

    if (!skipAnimation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const row of rows) {
        const previous = previousItemRects.current.get(row.dataset.setlistItem!)
        const next = nextRects.get(row.dataset.setlistItem!)
        if (!previous || !next) continue
        const x = previous.left - next.left
        const y = previous.top - next.top
        if (x === 0 && y === 0) continue
        row.style.transition = 'none'
        row.style.translate = `${x}px ${y}px`
        void row.offsetHeight
        requestAnimationFrame(() => {
          if (!row.isConnected) return
          row.style.transition = 'transform 320ms cubic-bezier(.22, 1, .36, 1), translate 320ms cubic-bezier(.22, 1, .36, 1)'
          row.style.translate = '0 0'
        })
      }
    }

    previousItemRects.current = nextRects
    if (skipAnimation) {
      requestAnimationFrame(() => {
        previousItemRects.current = new Map(
          [...document.querySelectorAll<HTMLElement>('[data-setlist-item]')].map((row) => [
            row.dataset.setlistItem!,
            row.getBoundingClientRect(),
          ]),
        )
      })
    }
  }, [draft.map((item) => item.key).join('\u0000')])

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

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    setDragPreview({ activeId: id, overId: id })
  }

  function handleDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    setDragPreview((current) => current
      && current.activeId === activeId
      && current.overId === overId
      ? current
      : { activeId, overId })
  }

  function handleDragEnd(event: DragEndEvent) {
    const from = draft.findIndex((item) => item.key === String(event.active.id))
    const to = event.over ? draft.findIndex((item) => item.key === String(event.over!.id)) : -1
    if (from >= 0 && to >= 0 && from !== to) {
      skipNextLayoutAnimation.current = true
      setDraft((items) => arrayMove(items, from, to).map((item, index) => ({ ...item, sortOrder: index + 1 })))
    }
    setDragPreview(null)
  }

  function handleDragCancel() {
    setDragPreview(null)
  }

  function addSelectedArrangements() {
    const selected = options?.filter((item) => selectedArrangementIds.includes(item.arrangementId)) ?? []
    if (selected.length === 0) return
    setDraft((current) => [
      ...current,
      ...selected.map((option, index) => ({
        key: crypto.randomUUID(),
        arrangementId: option.arrangementId,
        sortOrder: current.length + index + 1,
        songTitle: option.songTitle,
        arrangementLabel: option.arrangementLabel,
      })),
    ])
    setSelectedArrangementIds([])
    setArrangementSearch('')
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
        setConflict(t('common.errorConflict'))
        try {
          await reload()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr, t))
        }
      } else {
        setError(mutationErrorMessage(err, t))
      }
    } finally {
      setSaving(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">{t('setlist.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <AppLink className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
          Mis grupos
        </AppLink>
      </div>
    )
  }

  if (setlist === undefined) {
    return <p aria-live="polite">{t('setlist.loading')}</p>
  }

  if (setlist === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? t('setlist.notFound')} />
        <AppLink
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={routes.groupSetlists(group.id)}
        >
          {t('setlist.setlists')}
        </AppLink>
      </div>
    )
  }

  const addPanelOpen = isOwner && showAdd
  const dragFrom = dragPreview ? draft.findIndex((item) => item.key === dragPreview.activeId) : -1
  const dragTo = dragPreview?.overId ? draft.findIndex((item) => item.key === dragPreview.overId) : -1
  const projectedDraft = dragFrom >= 0 && dragTo >= 0 && dragFrom !== dragTo
    ? arrayMove(draft, dragFrom, dragTo)
    : draft
  const displayedNumbers = new Map(projectedDraft.map((item, index) => [item.key, index + 1]))
  const savedKeys = setlist ? toDraft(setlist.items, t).map((item) => item.key) : []
  const hasUnsavedChanges =
    setlist != null && draft.map((item) => item.key).join('\u0000') !== savedKeys.join('\u0000')

  return (
    <section className="space-y-5 pb-16 sm:space-y-6" aria-labelledby="setlist-heading">
      <header data-testid="setlist-hero" className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:space-y-4 sm:p-6">
        <PageBreadcrumb
          items={[
            { to: routes.group(group.id), label: group.name },
            { to: routes.groupSetlists(group.id), label: t('schedule.setlistsTitle') },
            { label: setlist.name },
          ]}
        />
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end xl:justify-between xl:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary-ink sm:h-12 sm:w-12"
              aria-hidden="true"
            >
              <ListMusic className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h1 id="setlist-heading" className="sonivo-page-title text-2xl text-[var(--color-score-ink)] sm:text-4xl">
                {setlist.name}
              </h1>
              <p className="text-sm text-[var(--color-score-muted)]">
                {plural(
                  draft.length,
                  t('schedule.setlistArrangementsOne'),
                  t('schedule.setlistArrangementsMany'),
                )}
                {!isOwner ? <span> · {t('setlist.readonly')}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
            {isOwner && !renaming ? (
              <Button variant="secondary" onClick={() => setRenaming(true)}>
                {t('setlist.rename')}
              </Button>
            ) : null}
            {hasUnsavedChanges ? (
              <ReadinessChip tone="warn" testId="setlist-unsaved-changes">
                {t('setlist.unsavedChanges')}
              </ReadinessChip>
            ) : null}
            <ReadinessChip
              tone={draft.length === 0 ? 'neutral' : 'ok'}
              testId="setlist-status-chip"
            >
              {draft.length === 0
                ? t('schedule.setlistVacant')
                : plural(
                    draft.length,
                    t('schedule.setlistArrangementsOne'),
                    t('schedule.setlistArrangementsMany'),
                  )}
            </ReadinessChip>
            {isOwner ? (
              <Button
                variant="secondary"
                disabled={saving || !hasUnsavedChanges}
                onClick={() => void saveItems()}
              >
                {saving ? t('setlist.saving') : t('setlist.saveChanges')}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      <div>
        {renaming && isOwner ? (
          <section className="mb-4 max-w-xl rounded-2xl border border-border-subtle bg-surface p-4" aria-label={t('setlist.rename')}>
            <RenameSetlistForm
              groupId={group.id}
              setlist={setlist}
              onCancel={() => setRenaming(false)}
              onSaved={(next) => { setSetlist(next); setRenaming(false); setConflict(null) }}
              onConflict={async () => {
                setConflict(t('common.errorConflict'))
                setRenaming(false)
                try { await reload() } catch (err) { setError(mutationErrorMessage(err, t)) }
              }}
            />
          </section>
        ) : null}
        <section className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-3 sm:space-y-4 sm:p-5" aria-labelledby="composition-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="composition-heading" className="text-base font-semibold sm:text-lg">
              {t('setlist.composition')}
            </h2>
            {isOwner && !showAdd ? (
              <Button onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />{t('setlist.addToList')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted sm:text-sm">{t('setlist.compositionHint')}</p>

          {draft.length === 0 ? (
            <EmptyPanel
              title={t('schedule.emptySetlistTitle')}
              description={
                isOwner
                  ? t('setlist.emptyOwner')
                  : t('setlist.emptyMember')
              }
            />
          ) : (
            <div className="space-y-1">
              <div
                aria-hidden="true"
                className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
              >
                <span>{t('setlist.colNumber')}</span>
                <span>{t('setlist.colArrangement')}</span>
                <span>{t('setlist.colActions')}</span>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext
                  items={draft.map((item) => item.key)}
                  strategy={verticalListSortingStrategy}
                >
              <ol className="space-y-2">
                    {draft.map((item, index) => (
                      <SortableSetlistItem
                        key={item.key}
                        item={item}
                        index={index}
                        displayNumber={displayedNumbers.get(item.key) ?? index + 1}
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

          <GroupDialog
            open={addPanelOpen}
            onClose={() => {
              setShowAdd(false)
              setSelectedArrangementIds([])
              setSelectedAudioResourceIds({})
              setConfigurationSongId(null)
              setConfigurationArrangementId(null)
              setConfigurationAudioResourceId(null)
              setArrangementSearch('')
            }}
            title={t('setlist.addDialogTitle')}
            description={t('setlist.addDialogHint')}
            size="lg"
            mobileFullscreen
            testId="setlist-add-dialog"
            footer={options && options.length > 0 && !configurationSongId ? (requestClose) => (
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-sm text-muted">{t('setlist.selectedCount', { count: selectedArrangementIds.length })}</span>
                <div className="flex gap-2">
                  {draft.length > 0 ? <Button variant="secondary" onClick={requestClose}>{t('setlist.doneAdding')}</Button> : null}
                  <Button onClick={addSelectedArrangements} disabled={selectedArrangementIds.length === 0}>
                    <Plus className="h-4 w-4" aria-hidden="true" />{t('setlist.addSelected')}
                  </Button>
                </div>
              </div>
            ) : null}
          >
            {options === null ? (
              <p aria-live="polite">{t('setlist.loadingArrangements')}</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-muted">{t('setlist.noOptions')}</p>
            ) : configurationSongId ? (() => {
              const songOptions = options.filter((option) => option.songId === configurationSongId)
              const activeArrangement = songOptions.find((option) => option.arrangementId === configurationArrangementId) ?? songOptions[0]
              return (
                <div className="space-y-4" data-testid="setlist-song-configurator">
                  <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary-ink hover:bg-primary/10" onClick={() => setConfigurationSongId(null)}>
                    <ChevronRight className="h-4 w-4 rotate-180" aria-hidden="true" />{t('setlist.backToSongs')}
                  </button>
                  <div>
                    <h3 className="text-lg font-semibold text-ink">{songOptions[0]?.songTitle}</h3>
                    <p className="text-sm text-muted">{t('setlist.chooseVersionAndAudio')}</p>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-semibold text-ink">{t('setlist.versionLabel')}</legend>
                    {songOptions.map((option) => (
                      <label key={option.arrangementId} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border-subtle px-3 hover:bg-surface-hover">
                        <input type="radio" name="setlist-version" checked={activeArrangement?.arrangementId === option.arrangementId} onChange={() => {
                          setConfigurationArrangementId(option.arrangementId)
                          setConfigurationAudioResourceId(selectedAudioResourceIds[option.arrangementId] ?? option.audioResources[0]?.id ?? null)
                        }} />
                        <span className="text-sm font-medium text-ink">{option.arrangementLabel}</span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-semibold text-ink">{t('setlist.audioLabel')}</legend>
                    {activeArrangement?.audioResources.length ? activeArrangement.audioResources.map((resource) => (
                      <label key={resource.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border-subtle px-3 hover:bg-surface-hover">
                        <input type="radio" name="setlist-audio" checked={configurationAudioResourceId === resource.id} onChange={() => setConfigurationAudioResourceId(resource.id)} />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{resource.label}</span>
                        <span className="text-xs text-muted">{resource.purpose === 'click' ? t('setlist.clickTrack') : t('setlist.audioTrack')}</span>
                      </label>
                    )) : <p className="text-sm text-muted">{t('setlist.noAudioResources')}</p>}
                  </fieldset>
                  <div className="flex justify-end border-t border-border-subtle pt-3">
                    <Button onClick={() => {
                      if (!activeArrangement) return
                      setSelectedArrangementIds((current) => [...current.filter((id) => !songOptions.some((option) => option.arrangementId === id)), activeArrangement.arrangementId])
                      if (configurationAudioResourceId) setSelectedAudioResourceIds((current) => ({ ...current, [activeArrangement.arrangementId]: configurationAudioResourceId }))
                      setConfigurationSongId(null)
                    }}>{t('setlist.confirmSelection')}</Button>
                  </div>
                </div>
              )
            })() : (
              <>
                <label className="relative block">
                  <span className="sr-only">{t('setlist.searchArrangements')}</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input
                    autoFocus
                    data-autofocus
                    className={`${fieldClass} pl-10`}
                    placeholder={t('setlist.searchArrangements')}
                    value={arrangementSearch}
                    onChange={(event) => setArrangementSearch(event.target.value)}
                  />
                </label>
                <ul className="divide-y divide-border-subtle" aria-label={t('setlist.arrangementLabel')}>
                  {groupArrangementOptions(options, arrangementSearch).map(({ songId, arrangements }) => {
                    const option = arrangements[0]!
                    const selectedOption = arrangements.find((candidate) => selectedArrangementIds.includes(candidate.arrangementId))
                    const selected = Boolean(selectedOption)
                    const addedCount = draft.filter((item) => arrangements.some((candidate) => candidate.arrangementId === item.arrangementId)).length
                    return (
                      <li key={songId} className="py-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setSelectedArrangementIds((current) => selected
                              ? current.filter((id) => !arrangements.some((candidate) => candidate.arrangementId === id))
                              : [...current.filter((id) => !arrangements.some((candidate) => candidate.arrangementId === id)), option.arrangementId])}
                            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary-ink'}`} aria-hidden="true">
                              {selected ? <Check className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-ink">{option.songTitle}</span>
                              <span className="block truncate text-sm text-muted">{selectedOption
                                ? `${selectedOption.arrangementLabel}${selectedAudioResourceIds[selectedOption.arrangementId]
                                  ? ` · ${selectedOption.audioResources.find((resource) => resource.id === selectedAudioResourceIds[selectedOption.arrangementId])?.label ?? ''}`
                                  : ''}`
                                : t('setlist.defaultVersion')}</span>
                            </span>
                            {addedCount > 0 ? (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary-ink" aria-label={plural(addedCount, t('setlist.addedOne'), t('setlist.addedMany'))}>
                                {plural(addedCount, t('setlist.addedOne'), t('setlist.addedMany'))}
                              </span>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            aria-label={t('setlist.chooseAudio', { song: option.songTitle })}
                            onClick={() => {
                              const active = arrangements.find((candidate) => selectedArrangementIds.includes(candidate.arrangementId)) ?? option
                              setConfigurationSongId(songId)
                              setConfigurationArrangementId(active.arrangementId)
                              setConfigurationAudioResourceId(selectedAudioResourceIds[active.arrangementId] ?? active.audioResources[0]?.id ?? null)
                            }}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-primary-ink hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <ChevronRight className="h-5 w-5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </GroupDialog>
        </section>

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
        setError(mutationErrorMessage(err, t))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit} noValidate>
      <p className="text-xs text-muted">{t('setlist.renameHint')}</p>
      <ProblemAlert message={error} />
      <Field label={t('setlist.nameLabel')}>
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
          {pending ? t('setlist.saving') : t('setlist.saveName')}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={onCancel}>
          {t('setlist.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}
