import { useEffect, useMemo, useState } from 'react'
import { Music2 } from 'lucide-react'
import {
  listArrangements,
  listMemberResourceGrants,
  listResources,
  listSongs,
  setMemberResourceAccess,
} from '../../api/client'
import type {
  ArrangementListItem,
  MemberListItem,
  MemberResourceGrant,
  ResourceSummary,
  SongListItem,
} from '../../api/client'
import { useT } from '../../i18n'
import { mutationErrorMessage } from '../../repertoire/ui'
import { GroupButton, GroupInput, GroupListSkeleton } from '../ui'
import { GroupDialog } from '../ui/GroupDialog'
import { MemberResourceAccessControl } from './MemberResourceAccessControl'

type ResourceType = MemberResourceGrant['resourceType']
type AccessValues = Record<string, boolean | null>

function accessKey(resourceType: ResourceType, resourceId: string) {
  return `${resourceType}:${resourceId}`
}

export function MemberResourceAccessDialog({
  open,
  onClose,
  groupId,
  member,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  member: MemberListItem | null
}) {
  const { t } = useT()
  const memberUserId = member?.userId ?? null
  const [songs, setSongs] = useState<SongListItem[] | null>(null)
  const [values, setValues] = useState<AccessValues>({})
  const [arrangementsBySong, setArrangementsBySong] = useState<Record<string, ArrangementListItem[]>>({})
  const [resourcesByArrangement, setResourcesByArrangement] = useState<Record<string, ResourceSummary[]>>({})
  const [loadedBranches, setLoadedBranches] = useState<Set<string>>(new Set())
  const [loadingBranches, setLoadingBranches] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !memberUserId) return
    let cancelled = false
    setSongs(null)
    setValues({})
    setArrangementsBySong({})
    setResourcesByArrangement({})
    setLoadedBranches(new Set())
    setLoadingBranches(new Set())
    setQuery('')
    setError(null)
    setLoading(true)

    void Promise.all([
      listSongs(groupId),
      listMemberResourceGrants(groupId, memberUserId),
    ])
      .then(([groupSongs, grants]) => {
        if (cancelled) return
        setSongs(groupSongs)
        setValues(Object.fromEntries(
          grants.map((grant) => [accessKey(grant.resourceType, grant.resourceId), grant.granted]),
        ))
      })
      .catch((cause) => {
        if (!cancelled) setError(mutationErrorMessage(cause, t))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, groupId, memberUserId])

  const visibleSongs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return (songs ?? []).filter((song) =>
      !needle || song.title.toLocaleLowerCase().includes(needle),
    )
  }, [songs, query])

  async function loadBranch(key: string, load: () => Promise<void>) {
    if (loadedBranches.has(key) || loadingBranches.has(key)) return
    setLoadingBranches((current) => new Set(current).add(key))
    setError(null)
    try {
      await load()
      setLoadedBranches((current) => new Set(current).add(key))
    } catch (cause) {
      setError(mutationErrorMessage(cause, t))
    } finally {
      setLoadingBranches((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  async function changeAccess(resourceType: ResourceType, resourceId: string, value: boolean | null) {
    if (!member || pendingKey) return
    const key = accessKey(resourceType, resourceId)
    setPendingKey(key)
    setError(null)
    try {
      await setMemberResourceAccess(groupId, member.userId, resourceType, resourceId, value)
      setValues((current) => {
        if (value === null) {
          const next = { ...current }
          delete next[key]
          return next
        }
        return { ...current, [key]: value }
      })
    } catch (cause) {
      setError(mutationErrorMessage(cause, t))
    } finally {
      setPendingKey(null)
    }
  }

  const isRestricted = (resourceType: ResourceType, resourceId: string) =>
    values[accessKey(resourceType, resourceId)] === false

  return (
    <GroupDialog
      open={open && member !== null}
      onClose={onClose}
      title={t('roles.songAccessTitle')}
      description={member ? t('roles.songAccessDescription', { name: member.displayName }) : undefined}
      size="lg"
      pending={pendingKey !== null}
      testId="member-resource-access-dialog"
      footer={
        <GroupButton variant="secondary" type="button" onClick={onClose} disabled={pendingKey !== null}>
          {t('common.close')}
        </GroupButton>
      }
    >
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-muted">{t('roles.songAccessHint')}</p>
      <GroupInput
        label={t('roles.songAccessSearch')}
        type="search"
        value={query}
        disabled={loading || pendingKey !== null}
        onChange={(event) => setQuery(event.target.value)}
      />
      {loading ? (
        <GroupListSkeleton rows={4} label={t('roles.loading')} />
      ) : error && songs === null ? null : songs?.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle px-4 py-8 text-center">
          <Music2 className="mx-auto mb-2 h-5 w-5 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">{t('roles.songAccessEmpty')}</p>
        </div>
      ) : visibleSongs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('roles.songAccessNoMatches')}</p>
      ) : (
        <ul className="max-h-[55vh] divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle">
          {visibleSongs.map((song) => {
            const songRestricted = isRestricted('song', song.id)
            const songBranch = `song:${song.id}`
            return (
              <li key={song.id} className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{song.title}</p>
                    {song.attribution ? <p className="truncate text-xs text-muted">{song.attribution}</p> : null}
                  </div>
                  <MemberResourceAccessControl
                    resourceType="song"
                    resourceId={song.id}
                    label={song.title}
                    values={values}
                    parentRestricted={false}
                    pending={pendingKey !== null}
                    onChange={(type, id, value) => void changeAccess(type, id, value)}
                  />
                </div>
                <details
                  className="mt-2 pl-2"
                  onToggle={(event) => {
                    if (event.currentTarget.open) {
                      void loadBranch(songBranch, async () => {
                        const rows = await listArrangements(groupId, song.id)
                        setArrangementsBySong((current) => ({ ...current, [song.id]: rows }))
                      })
                    }
                  }}
                >
                  <summary className="cursor-pointer rounded-md py-2 text-sm text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary">
                    {t('roles.resourceAccessArrangements', { count: arrangementsBySong[song.id]?.length ?? 0 })}
                  </summary>
                  {loadingBranches.has(songBranch) ? (
                    <p className="py-2 text-sm text-muted" role="status">{t('roles.resourceAccessLoading')}</p>
                  ) : arrangementsBySong[song.id]?.length ? (
                    <ul className="ml-3 border-l border-border-subtle pl-3">
                      {arrangementsBySong[song.id].map((arrangement) => {
                        const arrangementRestricted = songRestricted || isRestricted('arrangement', arrangement.id)
                        const arrangementBranch = `arrangement:${arrangement.id}`
                        return (
                          <li key={arrangement.id} className="border-b border-border-subtle py-2 last:border-b-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="min-w-0 truncate text-sm text-ink">{arrangement.label}</span>
                              <MemberResourceAccessControl
                                resourceType="arrangement"
                                resourceId={arrangement.id}
                                label={arrangement.label}
                                values={values}
                                parentRestricted={songRestricted}
                                pending={pendingKey !== null}
                                onChange={(type, id, value) => void changeAccess(type, id, value)}
                              />
                            </div>
                            <details
                              className="mt-1"
                              onToggle={(event) => {
                                if (event.currentTarget.open) {
                                  void loadBranch(arrangementBranch, async () => {
                                    const rows = await listResources(groupId, arrangement.id)
                                    setResourcesByArrangement((current) => ({ ...current, [arrangement.id]: rows }))
                                  })
                                }
                              }}
                            >
                              <summary className="cursor-pointer rounded-md py-2 text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary">
                                {t('roles.resourceAccessFiles', { count: resourcesByArrangement[arrangement.id]?.length ?? 0 })}
                              </summary>
                              {loadingBranches.has(arrangementBranch) ? (
                                <p className="py-2 text-sm text-muted" role="status">{t('roles.resourceAccessLoading')}</p>
                              ) : resourcesByArrangement[arrangement.id]?.length ? (
                                <ul className="ml-3 border-l border-border-subtle pl-3">
                                  {resourcesByArrangement[arrangement.id].map((resource) => (
                                    <li key={resource.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                      <span className="min-w-0 truncate text-sm text-ink">{resource.label}</span>
                                      <MemberResourceAccessControl
                                        resourceType="resource"
                                        resourceId={resource.id}
                                        label={resource.label}
                                        values={values}
                                        parentRestricted={arrangementRestricted}
                                        pending={pendingKey !== null}
                                        onChange={(type, id, value) => void changeAccess(type, id, value)}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              ) : loadedBranches.has(arrangementBranch) ? (
                                <p className="py-2 text-sm text-muted">{t('roles.resourceAccessNoFiles')}</p>
                              ) : null}
                            </details>
                          </li>
                        )
                      })}
                    </ul>
                  ) : loadedBranches.has(songBranch) ? (
                    <p className="py-2 text-sm text-muted">{t('roles.resourceAccessNoArrangements')}</p>
                  ) : null}
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </GroupDialog>
  )
}
