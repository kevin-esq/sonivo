import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Music,
  Package,
  Plus,
} from 'lucide-react'
import {
  getGroup,
  listGroupResources,
  problemDetail,
  resourceContentUrl,
  type GroupResourceItem,
} from '../api/client'
import { useT, type I18nKey } from '../i18n'
import { cn } from '../ui/cn'
import { canManageContentRole } from '../repertoire/ui'
import { useResource } from '../hooks/useResource'
import {
  GroupButton,
  GroupChip,
  GroupEmptyState,
  GroupErrorState,
  GroupIconWell,
  GroupInput,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  useGroupDataSignal,
} from './ui'
import { CreateResourceDialog } from './dialogs'

type ResourceCategory = 'music' | 'docs' | 'images' | 'videos' | 'other'

const CATEGORY_ORDER: ResourceCategory[] = ['music', 'docs', 'images', 'videos', 'other']

const CATEGORY_LABEL: Record<ResourceCategory, I18nKey> = {
  music: 'recursos.catMusic',
  docs: 'recursos.catDocs',
  images: 'recursos.catImages',
  videos: 'recursos.catVideos',
  other: 'recursos.catOther',
}

const RESOURCE_CARD_CLASS =
  'flex min-h-24 flex-col gap-2 rounded-2xl border border-border-subtle bg-surface p-4 text-ink no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none'

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

  // Live refresh when resources change elsewhere (upload, edit, delete).
  useGroupDataSignal('resources', groupId, () => setReloadKey((key) => key + 1))

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
    return <GroupListSkeleton rows={4} label={t('recursos.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={error} />
        <GroupLink variant="soft" to="/grupos">
          {t('workspace.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const canUpload = canManageContentRole(group.role)

  return (
    <section className="space-y-4" aria-labelledby="resources-heading">
      <GroupPageHeader
        headingId="resources-heading"
        icon={Package}
        title={t('recursos.title')}
        subtitle={t('recursos.subtitle')}
        actions={
          canUpload ? (
            <GroupButton onClick={() => setShowUpload(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('recursos.upload')}
            </GroupButton>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <GroupInput
              type="search"
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
      </GroupPageHeader>

      {surface.loading && items.length === 0 ? (
        <GroupListSkeleton rows={4} label={t('recursos.loading')} />
      ) : filtered.length === 0 ? (
        <GroupEmptyState
          icon={Package}
          title={t('recursos.emptyTitle')}
          description={t('recursos.emptyBody')}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <ResourceCard key={item.id} item={item} groupId={group.id} lang={lang} t={t} />
          ))}
        </ul>
      )}

      {showUpload && canUpload ? (
        <CreateResourceDialog
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
        'min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
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
      <a href={href} target="_blank" rel="noreferrer" className={RESOURCE_CARD_CLASS}>
        <div className="flex items-center gap-3">
          <GroupIconWell icon={Icon} tone="accent" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ink">{item.label}</span>
            <span className="block truncate text-xs text-muted">
              {item.songTitle}
              {item.arrangementLabel ? ` · ${item.arrangementLabel}` : ''}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <GroupChip tone="neutral">{t(CATEGORY_LABEL[category])}</GroupChip>
          {item.kind === 'link' ? (
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3 w-3" aria-hidden="true" />
              {t('recursos.linkKind')}
            </span>
          ) : (
            <span>{formatSize(item.byteSize)}</span>
          )}
          <span aria-hidden="true">·</span>
          <span>{formatDate(item.createdAt, lang)}</span>
        </div>
      </a>
    </li>
  )
}
