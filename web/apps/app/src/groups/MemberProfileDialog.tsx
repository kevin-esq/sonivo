import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CalendarDays,
  CheckSquare,
  KeyRound,
  Music2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { listGroupAudit, type GroupAuditEntry, type MemberListItem } from '../api/client'
import { useT, type I18nKey, type TParams } from '../i18n'
import { cn } from '../ui/cn'
import { auditActionMeta } from '../groups/auditActions'
import { musicalRolesText, parseMusicalRoles } from '../groups/MusicalRoleChips'
import {
  GroupButton,
  GroupCard,
  GroupChip,
  GroupDialog,
  GroupEmptyState,
  GroupErrorState,
  GroupListSkeleton,
} from '../groups/ui'

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

type MembershipRole = 'Owner' | 'Manager' | 'Member' | 'Viewer'
type ProfileTab = 'info' | 'activity' | 'access' | 'reports'

const ROLE_LABEL_KEY: Record<MembershipRole, I18nKey> = {
  Owner: 'roles.roleOwner',
  Manager: 'roles.roleManager',
  Member: 'roles.roleMember',
  Viewer: 'roles.roleViewer',
}

const ROLE_ICON: Record<MembershipRole, LucideIcon> = {
  Owner: ShieldCheck,
  Manager: Users,
  Member: UserRound,
  Viewer: UserRound,
}

const AVATAR_TONES = [
  'bg-primary/15 text-primary-ink',
  'bg-success/20 text-success-ink',
  'bg-warning/20 text-ink',
  'bg-error/15 text-error-ink',
] as const

/**
 * Reports the product should show per member. The API has no per-member
 * metrics yet, so each one renders as a named placeholder — never a number.
 */
const REPORT_PLANS: readonly {
  key: string
  icon: LucideIcon
  titleKey: I18nKey
  hintKey: I18nKey
}[] = [
  {
    key: 'attendance',
    icon: CalendarDays,
    titleKey: 'people.reportsAttendance',
    hintKey: 'people.reportsAttendanceHint',
  },
  {
    key: 'tasks',
    icon: CheckSquare,
    titleKey: 'people.reportsTasks',
    hintKey: 'people.reportsTasksHint',
  },
  {
    key: 'repertoire',
    icon: Music2,
    titleKey: 'people.reportsRepertoire',
    hintKey: 'people.reportsRepertoireHint',
  },
  {
    key: 'roles',
    icon: ShieldCheck,
    titleKey: 'people.reportsRoles',
    hintKey: 'people.reportsRolesHint',
  },
]

const PROFILE_TABS: readonly { id: ProfileTab; labelKey: I18nKey }[] = [
  { id: 'info', labelKey: 'people.profileTabInfo' },
  { id: 'activity', labelKey: 'people.profileTabActivity' },
  { id: 'access', labelKey: 'people.profileTabAccess' },
  { id: 'reports', labelKey: 'people.profileTabReports' },
]

type TFunction = (key: I18nKey, params?: TParams) => string

function isMembershipRole(value: string | undefined): value is MembershipRole {
  return value === 'Owner' || value === 'Manager' || value === 'Member' || value === 'Viewer'
}

function roleOf(member: MemberListItem): MembershipRole {
  return isMembershipRole(member.role) ? member.role : 'Member'
}

/** "Carlos King" → "CK"; the tone comes from the id so a person keeps its color. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : words[0]!.slice(0, 2)
  return letters.toUpperCase()
}

function toneFor(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]!
}

/** Presence is the member's last heartbeat (ADR-0051). */
function presenceOf(
  lastSeenAt: string | null | undefined,
  t: TFunction,
  now: number,
): { label: string; online: boolean } {
  if (!lastSeenAt) return { label: t('people.neverSeen'), online: false }
  const seenAt = new Date(lastSeenAt).getTime()
  if (Number.isNaN(seenAt)) return { label: t('people.neverSeen'), online: false }
  const diffMs = now - seenAt
  if (diffMs < 5 * 60 * 1000) return { label: t('people.online'), online: true }
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 24) return { label: t('people.lastSeenHours', { count: hours }), online: false }
  return { label: t('people.lastSeenDays', { count: Math.floor(hours / 24) }), online: false }
}

/** Locale-aware date/time (the app locale, never a hardcoded one). */
function formatDateTime(value: string, lang: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export type MemberProfileDialogProps = {
  member: MemberListItem
  groupId: string
  /** Owner may read the group audit log; that endpoint is Owner-only (ADR-0051). */
  canReadAudit: boolean
  /** Managed account behind this member, when the group provisions access. */
  managedAccount: { memberId: string; handle: string | null } | null
  onClose: () => void
  onResetAccess: () => void
}

/**
 * One person, four facets: who they are, what they did, how they get in, and
 * what the group will be able to measure about them.
 *
 * Every facet shows real data when the API has it. Where it does not (active
 * sessions, attendance, per-member reports) the UI shows a named, disabled
 * placeholder instead of invented numbers — the shape is ready, the data is
 * not there yet.
 */
export function MemberProfileDialog({
  member,
  groupId,
  canReadAudit,
  managedAccount,
  onClose,
  onResetAccess,
}: MemberProfileDialogProps) {
  const { t, lang } = useT()
  const [tab, setTab] = useState<ProfileTab>('info')
  const role = roleOf(member)
  const RoleIcon = ROLE_ICON[role]
  const presence = presenceOf(member.lastSeenAt, t, Date.now())

  return (
    <GroupDialog
      open
      onClose={onClose}
      size="lg"
      title={t('people.profileTitle')}
      description={t('people.profileHint', { name: member.displayName })}
      testId="member-profile-dialog"
      footer={
        <GroupButton variant="secondary" onClick={onClose}>
          {t('common.close')}
        </GroupButton>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-base font-bold',
            toneFor(member.userId),
          )}
        >
          {initialsOf(member.displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{member.displayName}</p>
          <p className="truncate text-sm text-muted">{member.email ?? t('people.emailNone')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <GroupChip tone={role === 'Owner' ? 'accent' : 'neutral'} icon={RoleIcon}>
              {t(ROLE_LABEL_KEY[role])}
            </GroupChip>
            <GroupChip tone={presence.online ? 'success' : 'neutral'}>{presence.label}</GroupChip>
            {managedAccount ? (
              <GroupChip tone="outline" icon={KeyRound}>
                {t('people.accessManaged')}
              </GroupChip>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('people.profileTabsLabel')}>
        {PROFILE_TABS.map((definition) => (
          <button
            key={definition.id}
            type="button"
            role="tab"
            aria-selected={tab === definition.id}
            onClick={() => setTab(definition.id)}
            className={cn(
              'min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              tab === definition.id
                ? 'bg-primary-strong text-primary-foreground'
                : 'text-muted hover:text-ink',
            )}
          >
            {t(definition.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <InfoTab member={member} lang={lang} presenceLabel={presence.label} />
      ) : null}

      {tab === 'activity' ? (
        <ActivityTab groupId={groupId} member={member} canReadAudit={canReadAudit} />
      ) : null}

      {tab === 'access' ? (
        <AccessTab
          presenceLabel={presence.label}
          managedAccount={managedAccount}
          onResetAccess={onResetAccess}
        />
      ) : null}

      {tab === 'reports' ? <ReportsTab member={member} /> : null}
    </GroupDialog>
  )
}

/* ------------------------------------------------------------------ */
/* Information                                                         */
/* ------------------------------------------------------------------ */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-hover/60 px-3 py-2">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{value}</dd>
    </div>
  )
}

function InfoTab({
  member,
  lang,
  presenceLabel,
}: {
  member: MemberListItem
  lang: string
  presenceLabel: string
}) {
  const { t } = useT()
  const role = roleOf(member)
  const instruments = parseMusicalRoles(member.musicalRole)

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <InfoRow label={t('people.colRole')} value={t(ROLE_LABEL_KEY[role])} />
      <InfoRow
        label={t('people.colInstrument')}
        value={
          instruments.length === 0
            ? t('people.instrumentNone')
            : musicalRolesText(member.musicalRole, t)
        }
      />
      <InfoRow label={t('people.emailLabel')} value={member.email ?? t('people.emailNone')} />
      <InfoRow label={t('people.joinedLabel')} value={formatDateTime(member.createdAt, lang)} />
      <InfoRow label={t('people.colActivity')} value={presenceLabel} />
    </dl>
  )
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

const ACTIVITY_LIMIT = 8

function ActivityTab({
  groupId,
  member,
  canReadAudit,
}: {
  groupId: string
  member: MemberListItem
  canReadAudit: boolean
}) {
  const { t, lang } = useT()
  const [entries, setEntries] = useState<GroupAuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canReadAudit) return
    let cancelled = false
    setEntries(null)
    setError(null)
    void listGroupAudit(groupId, { actorUserId: member.userId, take: ACTIVITY_LIMIT })
      .then((page) => {
        if (!cancelled) setEntries(page.items)
      })
      .catch(() => {
        if (cancelled) return
        setEntries([])
        setError(t('audit.loadFailed'))
      })
    return () => {
      cancelled = true
    }
  }, [groupId, member.userId, canReadAudit, t])

  if (!canReadAudit) {
    return (
      <GroupCard className="flex items-start gap-3" padding="sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{t('people.profileActivityOwnerOnly')}</p>
          <p className="text-xs text-muted">{t('people.profileActivityOwnerOnlyHint')}</p>
        </div>
      </GroupCard>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-ink">
          {t('people.profileActivityTitle', { name: member.displayName })}
        </h3>
        <p className="text-xs text-muted">{t('people.profileActivityHint')}</p>
      </div>

      <GroupErrorState message={error} />

      {entries === null ? (
        <GroupListSkeleton rows={3} label={t('audit.loading')} />
      ) : entries.length === 0 ? (
        <GroupEmptyState
          icon={Activity}
          title={t('people.profileActivityEmptyTitle')}
          description={t('people.profileActivityEmptyBody')}
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const meta = auditActionMeta(entry.action)
            const Icon = meta.icon
            return (
              <li key={entry.id}>
                <GroupCard className="flex items-start gap-3" padding="sm">
                  <span
                    className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', meta.tone)}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{t(meta.labelKey)}</p>
                    <p className="text-xs text-muted">{formatDateTime(entry.createdAt, lang)}</p>
                  </div>
                </GroupCard>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs text-muted">{t('people.profileActivitySoon')}</p>
      <Link
        to={`/groups/${groupId}/ajustes?tab=audit`}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Activity className="h-4 w-4" aria-hidden="true" />
        {t('people.profileActivityFullLog')}
      </Link>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */

function AccessTab({
  presenceLabel,
  managedAccount,
  onResetAccess,
}: {
  presenceLabel: string
  managedAccount: { memberId: string; handle: string | null } | null
  onResetAccess: () => void
}) {
  const { t } = useT()

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        <InfoRow label={t('people.accessState')} value={presenceLabel} />
        <InfoRow label={t('people.accessLastSeen')} value={presenceLabel} />
        {managedAccount ? (
          <InfoRow
            label={t('people.accessHandle')}
            value={managedAccount.handle ?? t('people.accessManaged')}
          />
        ) : null}
      </dl>

      {managedAccount ? (
        <div className="flex flex-wrap items-center gap-3">
          <GroupButton variant="secondary" onClick={onResetAccess}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {t('roster.reset')}
          </GroupButton>
          <p className="text-xs text-muted">{t('people.accessResetHint')}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <SoonBadge label={t('people.comingSoon')} />
        <GroupCard className="flex items-start gap-3" padding="sm">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{t('people.accessSessions')}</p>
            <p className="text-xs text-muted">{t('people.accessSessionsHint')}</p>
          </div>
        </GroupCard>
        <GroupCard className="flex items-start gap-3" padding="sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{t('people.accessDeactivate')}</p>
            <p className="text-xs text-muted">{t('people.accessDeactivateHint')}</p>
          </div>
        </GroupCard>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

function ReportsTab({ member }: { member: MemberListItem }) {
  const { t } = useT()

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-ink">
          {t('people.reportsTitle', { name: member.displayName })}
        </h3>
        <p className="text-xs text-muted">{t('people.reportsHint')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {REPORT_PLANS.map((plan) => {
          const Icon = plan.icon
          return (
            <GroupCard key={plan.key} className="space-y-2" padding="sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-hover text-muted"
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate text-sm font-semibold text-ink">{t(plan.titleKey)}</span>
                </span>
                <SoonBadge label={t('people.comingSoon')} />
              </div>
              <p className="text-xs text-muted">{t(plan.hintKey)}</p>
              <p className="font-display text-2xl font-bold text-muted" aria-hidden="true">
                —
              </p>
            </GroupCard>
          )
        })}
      </div>

      <p className="text-xs text-muted">{t('people.reportsUnavailable')}</p>
    </div>
  )
}

function SoonBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-ink">
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}
