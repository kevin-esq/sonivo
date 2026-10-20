import { routes } from '../routing/routes'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, ListMusic, Music2, Search, Star } from 'lucide-react'
import { listSetlists, type CurrentUser, type SetlistListItem } from '../api/client'
import { cn } from '../ui/cn'
import {
  GroupButton,
  GroupEmptyState,
  GroupErrorState,
  GroupLimitNotice,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  groupFieldClass,
  limitReached,
  useGroupDataSignal,
} from '../groups/ui'
import { useGroupUsage } from '../groups/useGroupUsage'
import { CreateSetlistDialog } from '../groups/dialogs'
import { ReadinessChip } from '../repertoire/chrome'
import {
  canManageContentRole,
  mutationErrorMessage,
  useGroupContext,
} from '../repertoire/ui'
import { useT } from '../i18n'
import { plural } from '../ui/plural'

const SETLIST_ICONS = [ListMusic, Music2, Star, ListMusic] as const

function setlistIcon(index: number) {
  return SETLIST_ICONS[index % SETLIST_ICONS.length]!
}

function formatUpdatedAt(iso: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function SetlistListPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError, reload: reloadGroup } = useGroupContext(groupId, user.id)
  const { t, lang } = useT()
  const navigate = useNavigate()
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')

  const isOwner = canManageContentRole(group?.role)
  const { usage, reload: reloadUsage } = useGroupUsage(groupId)
  const setlistsAtLimit = limitReached(usage?.setlists)

  const filtered = useMemo(() => {
    if (!setlists) return null
    const q = query.trim().toLowerCase()
    if (!q) return setlists
    return setlists.filter((item) => item.name.toLowerCase().includes(q))
  }, [setlists, query])

  async function reload() {
    if (!groupId) return
    setListError(null)
    try {
      setSetlists(await listSetlists(groupId))
    } catch (err) {
      setSetlists([])
      setListError(mutationErrorMessage(err, t))
    }
  }

  useEffect(() => {
    if (!groupId || !group) return
    let cancelled = false
    async function load() {
      setSetlists(null)
      setListError(null)
      try {
        const result = await listSetlists(groupId!)
        if (!cancelled) setSetlists(result)
      } catch (err) {
        if (cancelled) return
        setSetlists([])
        setListError(mutationErrorMessage(err, t))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  // Live refresh when setlists change elsewhere (creation dialog, other tab).
  useGroupDataSignal('setlists', groupId, () => {
    void reload()
    void reloadUsage()
  })

  if (group === undefined) {
    return <GroupListSkeleton rows={4} label={t('schedule.loadingSetlists')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} onRetry={() => void reloadGroup()} />
        <GroupLink variant="soft" to={routes.home}>
          {t('workspace.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const showHeaderAdd = isOwner && setlists !== null && setlists.length > 0
  const searching = query.trim().length > 0

  return (
    <section className="space-y-8" aria-labelledby="setlists-heading">
      <div data-testid="setlists-hero">
        <GroupPageHeader
          headingId="setlists-heading"
          icon={ListMusic}
          title={t('schedule.setlistsTitle')}
          subtitle={t('schedule.setlistsSubtitle')}
          breadcrumb={[
            { to: routes.group(group.id), label: group.name },
            { label: t('schedule.setlistsTitle') },
          ]}
          actions={
            <>
              {setlists !== null ? (
                <ReadinessChip testId="setlists-count" tone="neutral">
                  {plural(setlists.length, t('common.setlistOne'), t('common.setlistMany'))}
                </ReadinessChip>
              ) : null}
              {showHeaderAdd ? (
                <GroupButton onClick={() => setShowCreate(true)} disabled={setlistsAtLimit}>
                  {t('schedule.newSetlist')}
                </GroupButton>
              ) : null}
            </>
          }
        >
          {!isOwner ? <p className="text-sm text-muted">{t('schedule.readonly')}</p> : null}
        </GroupPageHeader>
      </div>

      {setlists !== null && setlists.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-surface p-3 sm:p-4">
          <div className="relative min-w-52 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <label className="sr-only" htmlFor="setlists-search">
              {t('schedule.setlistsSearchLabel')}
            </label>
            <input
              id="setlists-search"
              data-testid="setlists-search"
              className={cn(groupFieldClass, 'pl-9')}
              type="search"
              placeholder={t('schedule.setlistsSearchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('schedule.setlistsSearchLabel')}
            />
          </div>
        </div>
      ) : null}
      {searching && filtered !== null ? (
        <p role="status" aria-live="polite" data-testid="setlists-results" className="text-sm text-muted">
          {plural(filtered.length, t('common.resultOne'), t('common.resultMany'))}
        </p>
      ) : null}

      <GroupErrorState message={listError} />

      <GroupLimitNotice
        label={t('plan.labelSetlists')}
        metric={usage?.setlists}
        upgradeHref={`${routes.groupSettings(group.id)}?tab=plan`}
      />

      {setlists === null ? (
        <GroupListSkeleton rows={4} label={t('schedule.loadingSetlists')} />
      ) : setlists.length === 0 ? (
        <GroupEmptyState
          icon={ListMusic}
          title={t('schedule.emptySetlistsTitle')}
          description={
            isOwner
              ? t('schedule.emptySetlistsOwner')
              : t('schedule.emptySetlistsMember')
          }
          action={
            isOwner ? (
              <GroupButton
                data-testid="setlists-empty-create"
                onClick={() => setShowCreate(true)}
                disabled={setlistsAtLimit}
              >
                {t('schedule.newSetlist')}
              </GroupButton>
            ) : (
              <GroupLink variant="soft" to={routes.groupLibrary(group.id)}>
                {t('schedule.goLibrary')}
              </GroupLink>
            )
          }
        />
      ) : filtered && filtered.length === 0 ? (
        <GroupEmptyState title={`${t('schedule.noSetlistsPrefix')}${query.trim()}${t('schedule.noMatchSuffix')}`} />
      ) : (
        <div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered!.map((setlist, index) => {
              const Icon = setlistIcon(index)
              const empty = setlist.itemCount === 0
              return (
                <li
                  key={setlist.id}
                  className="library-enter"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <Link
                  className="group flex min-h-40 items-start gap-4 rounded-2xl border border-border-subtle bg-surface p-4 no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none sm:p-5"
                    to={routes.groupSetlist(group.id, setlist.id)}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-score-hover)] text-[var(--color-score-ink-soft)]" aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink transition-colors group-hover:text-primary-ink">
                        {setlist.name}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {plural(
                          setlist.itemCount,
                          t('schedule.setlistArrangementsOne'),
                          t('schedule.setlistArrangementsMany'),
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted sm:hidden">
                        {t('schedule.updatedPrefix')}{formatUpdatedAt(setlist.updatedAt, lang)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-2">
                      <ReadinessChip
                        tone={empty ? 'neutral' : 'accent'}
                        testId={`setlist-status-${setlist.id}`}
                      >
                        {empty
                          ? t('schedule.setlistVacant')
                          : plural(
                              setlist.itemCount,
                              t('schedule.setlistArrangementsOne'),
                              t('schedule.setlistArrangementsMany'),
                            )}
                      </ReadinessChip>
                      <span className="hidden text-xs text-muted sm:block">
                        {formatUpdatedAt(setlist.updatedAt, lang)}
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {isOwner && showCreate ? (
        <CreateSetlistDialog
          groupId={group.id}
          onClose={() => setShowCreate(false)}
          onCreated={(setlist) => {
            setShowCreate(false)
            void reload()
            void reloadUsage()
            navigate(routes.groupSetlist(group.id, setlist.id))
          }}
        />
      ) : null}
    </section>
  )
}
