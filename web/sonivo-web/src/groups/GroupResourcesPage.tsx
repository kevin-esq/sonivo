import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Music,
  Package,
  Plus,
  Upload,
} from 'lucide-react'
import {
  createFileResource,
  createLinkResource,
  getGroup,
  listArrangements,
  listGroupResources,
  listSongs,
  problemDetail,
  resourceContentUrl,
  type GroupResourceItem,
} from '../api/client'
import { useT, type I18nKey } from '../i18n'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { canManageContentRole, formatPurpose, mutationErrorMessage, ProblemAlert } from '../repertoire/ui'
import { useAction } from '../hooks/useAction'
import { useResource } from '../hooks/useResource'

type ResourceCategory = 'music' | 'docs' | 'images' | 'videos' | 'other'

const CATEGORY_ORDER: ResourceCategory[] = ['music', 'docs', 'images', 'videos', 'other']

const CATEGORY_LABEL: Record<ResourceCategory, I18nKey> = {
  music: 'recursos.catMusic',
  docs: 'recursos.catDocs',
  images: 'recursos.catImages',
  videos: 'recursos.catVideos',
  other: 'recursos.catOther',
}

const PURPOSES = ['chart', 'lyrics', 'audio', 'reference', 'practice', 'other'] as const

function categoryOf(item: GroupResourceItem): ResourceCategory {
  const contentType = item.contentType ?? ''
  if (contentType.startsWith('image/')) return 'images'
  if (contentType.startsWith('video/')) return 'videos'
  if (contentType.startsWith('audio/')) return 'music'
  if (contentType.includes('pdf') || contentType.startsWith('text/')) return 'docs'
  switch (item.purpose) {
    case 'chart':
    case 'lyrics':
    case 'reference':
      return 'docs'
    case 'audio':
    case 'click':
    case 'practice':
      return 'music'
    default:
      return 'other'
  }
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string, lang: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/**
 * W-D — group material library (`/groups/:id/recursos`). Aggregates every Resource
 * across the group's arrangements (ADR-0055). Upload requires an arrangement because
 * Resources stay on arrangements (ADR-0007/0014); Owner/Manager may upload.
 */
export function GroupResourcesPage() {
  const { groupId } = useParams()
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [group, setGroup] = useState<Awaited<ReturnType<typeof getGroup>> | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<ResourceCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showUpload, setShowUpload] = useState(false)
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
    group && groupId ? () => listGroupResources(groupId!) : null,
    [groupId, group, reloadKey],
  )

  const items = surface.data ?? []
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      if (category !== 'all' && categoryOf(item) !== category) return false
      if (!query) return true
      return (
        item.label.toLowerCase().includes(query) ||
        item.songTitle.toLowerCase().includes(query) ||
        (item.arrangementLabel?.toLowerCase().includes(query) ?? false)
      )
    })
  }, [items, category, searchQuery])

  const counts = useMemo(() => {
    const map = new Map<ResourceCategory, number>()
    for (const item of items) {
      const key = categoryOf(item)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [items])

  if (group === undefined) {
    return <p aria-live="polite">{t('recursos.loading')}</p>
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

  const canUpload = canManageContentRole(group.role)

  return (
    <section className="space-y-4" aria-labelledby="resources-heading">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 id="resources-heading" className="text-3xl font-bold tracking-tight text-ink">
              {t('recursos.title')}
            </h1>
            <p className="text-muted">{t('recursos.subtitle')}</p>
          </div>
          {canUpload ? (
            <Button onClick={() => setShowUpload(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('recursos.upload')}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <input
              type="search"
              className={fieldClass}
              placeholder={t('recursos.searchPlaceholder')}
              aria-label={t('recursos.searchLabel')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('recursos.title')}>
          <CategoryTab
            active={category === 'all'}
            labelKey="recursos.catAll"
            count={items.length}
            onClick={() => setCategory('all')}
          />
          {CATEGORY_ORDER.map((key) => (
            <CategoryTab
              key={key}
              active={category === key}
              labelKey={CATEGORY_LABEL[key]}
              count={counts.get(key) ?? 0}
              onClick={() => setCategory(key)}
            />
          ))}
        </div>
      </header>

      {surface.loading && items.length === 0 ? (
        <p aria-live="polite" className="text-sm text-muted">
          {t('recursos.loading')}
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface px-5 py-10 text-center">
          <Package className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-2 font-semibold text-ink">{t('recursos.emptyTitle')}</p>
          <p className="text-sm text-muted">{t('recursos.emptyBody')}</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <ResourceCard key={item.id} item={item} groupId={group.id} lang={lang} t={t} />
          ))}
        </ul>
      )}

      {showUpload && canUpload ? (
        <UploadResourceDialog
          groupId={group.id}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false)
            setReloadKey((key) => key + 1)
          }}
        />
      ) : null}
    </section>
  )
}

function CategoryTab({
  active,
  labelKey,
  count,
  onClick,
}: {
  active: boolean
  labelKey: I18nKey
  count: number
  onClick: () => void
}) {
  const { t } = useT()
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        active ? 'bg-primary-strong text-primary-foreground' : 'text-muted hover:text-ink',
      )}
    >
      {t(labelKey)}
      <span className={cn('ml-1.5 text-xs', active ? 'text-primary-foreground/80' : 'text-muted')}>
        {count}
      </span>
    </button>
  )
}

function ResourceCard({
  item,
  groupId,
  lang,
  t,
}: {
  item: GroupResourceItem
  groupId: string
  lang: string
  t: (key: I18nKey) => string
}) {
  const category = categoryOf(item)
  const Icon =
    category === 'music' ? Music
    : category === 'docs' ? FileText
    : category === 'images' ? ImageIcon
    : category === 'videos' ? Film
    : Package
  const href =
    item.kind === 'link'
      ? item.url ?? '#'
      : resourceContentUrl(groupId, item.arrangementId, item.id)
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-24 flex-col gap-2 rounded-2xl border border-border-subtle bg-surface p-4 no-underline transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ink">{item.label}</span>
            <span className="block truncate text-xs text-muted">
              {item.songTitle}
              {item.arrangementLabel ? ` · ${item.arrangementLabel}` : ''}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-surface-hover px-2 py-0.5 font-medium">
            {t(CATEGORY_LABEL[category])}
          </span>
          {item.kind === 'link' ? (
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3 w-3" aria-hidden="true" />
              {t('recursos.linkKind')}
            </span>
          ) : (
            <span>{formatSize(item.byteSize)}</span>
          )}
          <span>·</span>
          <span>{formatDate(item.createdAt, lang)}</span>
        </div>
      </a>
    </li>
  )
}

function UploadResourceDialog({
  groupId,
  onClose,
  onUploaded,
}: {
  groupId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const { t } = useT()
  const [songs, setSongs] = useState<Awaited<ReturnType<typeof listSongs>> | null>(null)
  const [songId, setSongId] = useState('')
  const [arrangements, setArrangements] = useState<Awaited<ReturnType<typeof listArrangements>> | null>(null)
  const [arrangementId, setArrangementId] = useState('')
  const [label, setLabel] = useState('')
  const [purpose, setPurpose] = useState<string>('reference')
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listSongs(groupId)
      .then((result) => {
        if (cancelled) return
        setSongs(result)
        const first = result[0]
        if (first) setSongId(first.id)
      })
      .catch(() => {
        if (!cancelled) setSongs([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  useEffect(() => {
    if (!songId) {
      setArrangements(null)
      setArrangementId('')
      return
    }
    let cancelled = false
    setArrangements(null)
    setArrangementId('')
    listArrangements(groupId, songId)
      .then((result) => {
        if (cancelled) return
        setArrangements(result)
        const first = result[0]
        if (first) setArrangementId(first.id)
      })
      .catch(() => {
        if (!cancelled) setArrangements([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId, songId])

  const upload = useAction(async () => {
    setError(null)
    if (mode === 'file') {
      if (!file) {
        setError(t('recursos.fileRequired'))
        return
      }
      await createFileResource(groupId, arrangementId, {
        purpose: purpose as never,
        label: label.trim(),
        file,
        note: note.trim() || null,
      })
    } else {
      await createLinkResource(groupId, arrangementId, {
        purpose: purpose as never,
        label: label.trim(),
        url: url.trim(),
        note: note.trim() || null,
      })
    }
    onUploaded()
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
          void upload.run()
        }}
        noValidate
      >
        <h2 className="text-lg font-semibold">{t('recursos.modalTitle')}</h2>
        <ProblemAlert message={upload.error != null ? mutationErrorMessage(upload.error) : error} />

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('recursos.fieldSong')}</span>
          <select
            className={fieldClass}
            value={songId}
            disabled={upload.pending}
            onChange={(event) => setSongId(event.target.value)}
          >
            {(songs ?? []).map((song) => (
              <option key={song.id} value={song.id}>
                {song.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('recursos.fieldArrangement')}</span>
          <select
            className={fieldClass}
            value={arrangementId}
            disabled={upload.pending || !songId}
            onChange={(event) => setArrangementId(event.target.value)}
          >
            {(arrangements ?? []).map((arrangement) => (
              <option key={arrangement.id} value={arrangement.id}>
                {arrangement.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('recursos.fieldLabel')}</span>
          <input
            className={fieldClass}
            value={label}
            maxLength={200}
            disabled={upload.pending}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('recursos.fieldCategory')}</span>
          <select
            className={fieldClass}
            value={purpose}
            disabled={upload.pending}
            onChange={(event) => setPurpose(event.target.value)}
          >
            {PURPOSES.map((value) => (
              <option key={value} value={value}>
                {formatPurpose(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('recursos.fieldDescription')}</span>
          <textarea
            className={fieldClass}
            rows={2}
            value={note}
            maxLength={2000}
            disabled={upload.pending}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('recursos.fieldFile')}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('file')}
              className={cn(
                'min-h-9 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                mode === 'file' ? 'bg-primary-strong text-primary-foreground' : 'bg-surface-hover text-muted',
              )}
            >
              {t('recursos.fileKind')}
            </button>
            <button
              type="button"
              onClick={() => setMode('link')}
              className={cn(
                'min-h-9 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                mode === 'link' ? 'bg-primary-strong text-primary-foreground' : 'bg-surface-hover text-muted',
              )}
            >
              {t('recursos.linkKind')}
            </button>
          </div>
          {mode === 'file' ? (
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-subtle bg-surface-hover/50 px-4 py-3 text-center text-sm text-muted">
              <Upload className="h-5 w-5" aria-hidden="true" />
              <span>{file ? file.name : t('recursos.dropHint')}</span>
              <span className="text-xs">{t('recursos.formatsHint')}</span>
              <input
                type="file"
                className="sr-only"
                disabled={upload.pending}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <input
              className={fieldClass}
              value={url}
              placeholder="https://"
              disabled={upload.pending}
              onChange={(event) => setUrl(event.target.value)}
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={upload.pending}>
            {t('recursos.cancel')}
          </Button>
          <Button type="submit" disabled={upload.pending || !label.trim() || !arrangementId}>
            {upload.pending ? t('recursos.saving') : t('recursos.uploadButton')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
