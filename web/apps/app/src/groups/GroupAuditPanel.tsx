import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Music2,
  ShieldCheck,
  UserMinus,
  UserPlus,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import {
  listGroupAudit,
  listMembers,
  type GroupAuditAction,
  type GroupAuditEntry,
  type MemberListItem,
} from '../api/client'
import { useT, type I18nKey } from '../i18n'
import { mutationErrorMessage } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { GroupCard, GroupEmptyState, GroupErrorState, GroupListSkeleton, GroupSelect } from './ui'

const PAGE_SIZE = 20

const ACTION_META: Record<string, { icon: LucideIcon; labelKey: I18nKey; tone: string }> = {
  role_changed: { icon: ShieldCheck, labelKey: 'audit.action.roleChanged', tone: 'bg-primary/15 text-primary-ink' },
  musical_role_changed: { icon: Music2, labelKey: 'audit.action.musicalRoleChanged', tone: 'bg-primary/15 text-primary-ink' },
  member_removed: { icon: UserMinus, labelKey: 'audit.action.memberRemoved', tone: 'bg-error/15 text-error-ink' },
  member_left: { icon: LogOut, labelKey: 'audit.action.memberLeft', tone: 'bg-surface-hover text-muted' },
  invitation_created: { icon: UserPlus, labelKey: 'audit.action.invitationCreated', tone: 'bg-success/15 text-success-ink' },
  invitation_revoked: { icon: XCircle, labelKey: 'audit.action.invitationRevoked', tone: 'bg-error/15 text-error-ink' },
}

function actionMeta(action: GroupAuditAction) {
  return (
    ACTION_META[action] ?? {
      icon: Activity,
      labelKey: 'audit.action.unknown' as I18nKey,
      tone: 'bg-surface-hover text-muted',
    }
  )
}

function relativeLabel(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * Owner-only group audit view (ADR-0051, advanced): server-side filters by action,
 * actor and date range with pagination. Actor/target ids resolve to member names.
 */
export function GroupAuditPanel({ groupId }: { groupId: string }) {
  const { t } = useT()
  const [entries, setEntries] = useState<GroupAuditEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [skip, setSkip] = useState(0)

  useEffect(() => {
    void listMembers(groupId)
      .then(setMembers)
      .catch(() => setMembers([]))
  }, [groupId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setEntries(null)
      setError(null)
      try {
        const page = await listGroupAudit(groupId, {
          action: actionFilter === 'all' ? null : actionFilter,
          actorUserId: actorFilter === 'all' ? null : actorFilter,
          from: fromFilter ? `${fromFilter}T00:00:00Z` : null,
          to: toFilter ? `${toFilter}T23:59:59Z` : null,
          skip,
          take: PAGE_SIZE,
        })
        if (cancelled) return
        setEntries(page.items)
        setTotal(page.total)
      } catch (err) {
        if (cancelled) return
        setEntries([])
        setTotal(0)
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, actionFilter, actorFilter, fromFilter, toFilter, skip])

  const nameOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) map.set(member.userId, member.displayName)
    return (userId: string | null | undefined) =>
      userId ? (map.get(userId) ?? t('audit.unknownUser')) : t('audit.system')
  }, [members, t])

  const actionOptions = [
    { value: 'all', label: t('audit.filterAll') },
    ...[...new Set(Object.keys(ACTION_META))].map((action) => ({
      value: action,
      label: t(actionMeta(action).labelKey),
    })),
  ]

  const actorOptions = [
    { value: 'all', label: t('audit.allActors') },
    ...members.map((member) => ({ value: member.userId, label: member.displayName })),
  ]

  function resetPaging() {
    setSkip(0)
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.floor(skip / PAGE_SIZE) + 1

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-ink">{t('audit.title')}</h2>
        <p className="text-sm text-muted">{t('audit.subtitle')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GroupSelect
          label={t('audit.filterLabel')}
          value={actionFilter}
          options={actionOptions}
          onChange={(value) => {
            setActionFilter(value)
            resetPaging()
          }}
        />
        <GroupSelect
          label={t('audit.actorLabel')}
          value={actorFilter}
          options={actorOptions}
          onChange={(value) => {
            setActorFilter(value)
            resetPaging()
          }}
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('audit.fromLabel')}</span>
          <input
            type="date"
            value={fromFilter}
            onChange={(event) => {
              setFromFilter(event.target.value)
              resetPaging()
            }}
            className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('audit.toLabel')}</span>
          <input
            type="date"
            value={toFilter}
            onChange={(event) => {
              setToFilter(event.target.value)
              resetPaging()
            }}
            className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </label>
      </div>

      <GroupErrorState message={error} />

      {entries === null ? (
        <GroupListSkeleton rows={4} label={t('audit.loading')} />
      ) : entries.length === 0 ? (
        <GroupEmptyState icon={Activity} title={t('audit.emptyTitle')} description={t('audit.emptyBody')} />
      ) : (
        <>
          <ul className="space-y-2" data-testid="audit-list">
            {entries.map((entry) => {
              const meta = actionMeta(entry.action)
              const Icon = meta.icon
              return (
                <li key={entry.id}>
                  <GroupCard className="flex items-start gap-3" padding="sm">
                    <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', meta.tone)} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{t(meta.labelKey)}</p>
                      <p className="text-sm text-muted">
                        {entry.targetUserId
                          ? t('audit.byTarget', { actor: nameOf(entry.actorUserId), target: nameOf(entry.targetUserId) })
                          : t('audit.byOnly', { actor: nameOf(entry.actorUserId) })}
                        {entry.metadata ? ` · ${entry.metadata}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{relativeLabel(entry.createdAt)}</p>
                    </div>
                  </GroupCard>
                </li>
              )
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted">{t('audit.total', { count: total })}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={skip === 0}
                onClick={() => setSkip((value) => Math.max(0, value - PAGE_SIZE))}
                aria-label={t('audit.prev')}
                className="grid h-10 w-10 place-items-center rounded-lg border border-border-subtle text-muted hover:text-ink disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-xs tabular-nums text-muted">{t('audit.pageInfo', { page, pages })}</span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setSkip((value) => value + PAGE_SIZE)}
                aria-label={t('audit.next')}
                className="grid h-10 w-10 place-items-center rounded-lg border border-border-subtle text-muted hover:text-ink disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
