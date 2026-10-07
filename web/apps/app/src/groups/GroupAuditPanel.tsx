import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
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
import { mutationErrorMessage } from '../repertoire/ui'
import { useT, type I18nKey } from '../i18n'
import { cn } from '../ui/cn'
import { GroupCard, GroupEmptyState, GroupErrorState, GroupListSkeleton, GroupSelect } from './ui'

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
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

/**
 * Owner-only group audit view (ADR-0051): the append-only log of membership and
 * invitation changes. Actor/target ids are resolved to member names when the
 * member is still in the group. Never renders user free text (metadata is a
 * short server-side token such as the new role).
 */
export function GroupAuditPanel({ groupId }: { groupId: string }) {
  const { t } = useT()
  const [entries, setEntries] = useState<GroupAuditEntry[] | null>(null)
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setEntries(null)
      setError(null)
      try {
        const [audit, roster] = await Promise.all([
          listGroupAudit(groupId),
          listMembers(groupId).catch(() => [] as MemberListItem[]),
        ])
        if (cancelled) return
        setEntries(audit)
        setMembers(roster)
      } catch (err) {
        if (cancelled) return
        setEntries([])
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId])

  const nameOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) map.set(member.userId, member.displayName)
    return (userId: string | null | undefined) =>
      userId ? (map.get(userId) ?? t('audit.unknownUser')) : t('audit.system')
  }, [members, t])

  const actionOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const entry of entries ?? []) seen.add(entry.action)
    return [
      { value: 'all', label: t('audit.filterAll') },
      ...[...seen].map((action) => ({ value: action, label: t(actionMeta(action).labelKey) })),
    ]
  }, [entries, t])

  const visible = (entries ?? []).filter((entry) => actionFilter === 'all' || entry.action === actionFilter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-ink">{t('audit.title')}</h2>
          <p className="text-sm text-muted">{t('audit.subtitle')}</p>
        </div>
        <div className="min-w-56">
          <GroupSelect
            label={t('audit.filterLabel')}
            value={actionFilter}
            options={actionOptions}
            onChange={setActionFilter}
          />
        </div>
      </div>

      <GroupErrorState message={error} />

      {entries === null ? (
        <GroupListSkeleton rows={4} label={t('audit.loading')} />
      ) : visible.length === 0 ? (
        <GroupEmptyState icon={Activity} title={t('audit.emptyTitle')} description={t('audit.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="audit-list">
          {visible.map((entry) => {
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
      )}
    </div>
  )
}
