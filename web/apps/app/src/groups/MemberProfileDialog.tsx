import { routes } from '../routing/routes'
import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  CalendarDays,
  CalendarPlus,
  Copy,
  Crown,
  KeyRound,
  ListChecks,
  Music4,
  Pencil,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { listGroupAudit, type GroupAuditEntry, type MemberListItem } from '../api/client'
import { useT, type I18nKey, type TParams } from '../i18n'
import { mutationErrorMessage } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { auditActionMeta } from './auditActions'
import { musicalRoleLabel, musicalRolesText, parseMusicalRoles, MusicalRolePicker } from './MusicalRoleChips'
import {
  GroupActionMenu,
  GroupButton,
  GroupCard,
  GroupChip,
  GroupDialog,
  GroupLink,
  GroupEmptyState,
  GroupErrorState,
  GroupListSkeleton,
  GroupTextArea,
  type GroupActionMenuItem,
} from './ui'

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

type MembershipRole = 'Owner' | 'Manager' | 'Member' | 'Viewer'
type ProfileTab = 'info' | 'activity' | 'access'

const ROLE_LABEL_KEY: Record<MembershipRole, I18nKey> = {
  Owner: 'roles.roleOwner',
  Manager: 'roles.roleManager',
  Member: 'roles.roleMember',
  Viewer: 'roles.roleViewer',
}

const ROLE_ICON: Record<MembershipRole, LucideIcon> = {
  Owner: Crown,
  Manager: ShieldCheck,
  Member: Users,
  Viewer: UserRound,
}

/** Icon tone for each audit action, reused in the activity timeline. */
const ACTIVITY_ICON_TONE: Record<string, string> = {
  role_changed: 'bg-primary/15 text-primary-ink',
  musical_role_changed: 'bg-primary/15 text-primary-ink',
  member_removed: 'bg-error/15 text-error-ink',
  member_left: 'bg-surface-hover text-muted',
  invitation_created: 'bg-success/20 text-success-ink',
  invitation_revoked: 'bg-error/15 text-error-ink',
  member_description_changed: 'bg-primary/15 text-primary-ink',
}

const AVATAR_TONES = [
  'bg-primary/15 text-primary-ink',
  'bg-success/20 text-success-ink',
  'bg-warning/20 text-ink',
  'bg-error/15 text-error-ink',
] as const

const PROFILE_TABS: readonly { id: ProfileTab; labelKey: I18nKey; icon: LucideIcon }[] = [
  { id: 'info', labelKey: 'people.profileTabInfo', icon: UserRound },
  { id: 'activity', labelKey: 'people.profileTabActivity', icon: Activity },
  { id: 'access', labelKey: 'people.profileTabAccess', icon: ShieldCheck },
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
  return new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' }).format(date)
}

/** "hace 6 días": relative age of a timestamp, in the app locale. */
function relativeLabel(value: string, lang: string, now: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const days = Math.round((date.getTime() - now) / 86_400_000)
  if (Math.abs(days) < 1) return rtf.format(Math.round((date.getTime() - now) / 3_600_000), 'hour')
  return rtf.format(days, 'day')
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export type MemberProfileDialogProps = {
  member: MemberListItem
  viewerUserId: string
  groupId: string
  /** Owner may read the group audit log; that endpoint is Owner-only (ADR-0051). */
  canReadAudit: boolean
  /** Owner or Manager may change the descriptive fields. */
  canEditProfile: boolean
  /** Only the Group owner may disable or restore membership access. */
  canManageAccess: boolean
  /** Actions available on this person (role, access, removal), built by the page. */
  menuItems: GroupActionMenuItem[]
  /** Managed account behind this member, when the group provisions access. */
  managedAccount: { memberId: string; handle: string | null } | null
  onClose: () => void
  onSaveDescription: (description: string) => Promise<void>
  onSaveSkills: (skills: string) => Promise<void>
  onEditProfile: () => void
  onResetAccess: () => void
  onSetAccessEnabled: (enabled: boolean) => Promise<void>
}

/** Selected member facts, group activity and access, without duplicating tab content. */
export function MemberProfileDialog({
  member,
  viewerUserId,
  groupId,
  canReadAudit,
  canEditProfile,
  canManageAccess,
  menuItems,
  managedAccount,
  onClose,
  onSaveDescription,
  onSaveSkills,
  onEditProfile,
  onResetAccess,
  onSetAccessEnabled,
}: MemberProfileDialogProps) {
  const { t, lang } = useT()
  const [tab, setTab] = useState<ProfileTab>('info')
  const tabRefs = useRef<Record<ProfileTab, HTMLButtonElement | null>>({
    info: null,
    activity: null,
    access: null,
  })
  const [editing, setEditing] = useState<'none' | 'description' | 'skills'>('none')
  const role = roleOf(member)
  const RoleIcon = ROLE_ICON[role]
  const skills = parseMusicalRoles(member.musicalRole)
  const presence = presenceOf(member.lastSeenAt, t, Date.now())
  const now = Date.now()
  const isSelf = member.userId === viewerUserId
  const overflowItems = menuItems.filter((item) => item.key !== 'edit' && item.key !== 'instrument')

  return (
    <GroupDialog
      open
      onClose={onClose}
      size="xl"
      mobileFullscreen
      title={t(isSelf ? 'people.ownProfileTitle' : 'people.profileTitle')}
      testId="member-profile-dialog"
      footer={
        <GroupButton variant="secondary" onClick={onClose}>
          {t('common.close')}
        </GroupButton>
      }
    >
      <div className="space-y-5">
        {/* Header: back, identity, chips and the page-level actions. */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <span
              aria-hidden="true"
              className={cn(
                'grid h-16 w-16 shrink-0 place-items-center rounded-full text-lg font-bold',
                toneFor(member.userId),
              )}
            >
              {initialsOf(member.displayName)}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-0.5">
                <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                  {member.displayName}
                </h2>
                <p className="truncate text-sm text-muted">
                  {member.email ?? t('people.emailNone')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {isSelf ? <GroupChip tone="accent">{t('people.selfProfile')}</GroupChip> : null}
                <GroupChip tone="outline">{t('people.accountLinked')}</GroupChip>
                <GroupChip tone={role === 'Owner' ? 'accent' : 'neutral'} icon={RoleIcon}>
                  {t(ROLE_LABEL_KEY[role])}
                </GroupChip>
                <GroupChip tone={presence.online ? 'success' : 'neutral'}>{presence.label}</GroupChip>
                {skills.length > 0 ? (
                  <GroupChip tone="outline" icon={Music4}>
                    {musicalRoleLabel(skills[0]!, t)}
                  </GroupChip>
                ) : null}
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('people.joinedRelative', {
                    when: relativeLabel(member.createdAt, lang, now),
                  })}
                </span>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {isSelf ? <GroupLink variant="ghost" to={routes.account}>{t('people.accountSettings')}</GroupLink> : null}
              {canEditProfile ? (
                <GroupButton
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  onClick={onEditProfile}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  {t('people.editProfile')}
                </GroupButton>
              ) : null}
              {overflowItems.length > 0 ? (
                <GroupActionMenu
                  label={t('people.actionsFor', { name: member.displayName })}
                  items={overflowItems}
                />
              ) : null}
            </div>
          </div>

          <div
            className="flex flex-wrap gap-1 border-b border-border-subtle"
            role="tablist"
            aria-label={t('people.profileTabsLabel')}
            onKeyDown={(event) => {
              const currentIndex = PROFILE_TABS.findIndex((definition) => definition.id === tab)
              let nextIndex = currentIndex
              if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % PROFILE_TABS.length
              else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + PROFILE_TABS.length) % PROFILE_TABS.length
              else if (event.key === 'Home') nextIndex = 0
              else if (event.key === 'End') nextIndex = PROFILE_TABS.length - 1
              else return

              event.preventDefault()
              const nextTab = PROFILE_TABS[nextIndex]!.id
              setTab(nextTab)
              tabRefs.current[nextTab]?.focus()
            }}
          >
            {PROFILE_TABS.map((definition) => {
              const Icon = definition.icon
              const active = tab === definition.id
              return (
                <button
                  key={definition.id}
                  type="button"
                  role="tab"
                  id={`member-profile-tab-${definition.id}`}
                  aria-controls="member-profile-panel"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  ref={(element) => {
                    tabRefs.current[definition.id] = element
                  }}
                  onClick={() => setTab(definition.id)}
                  className={cn(
                    '-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    active
                      ? 'border-primary text-primary-ink'
                      : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t(definition.labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        <div
          id="member-profile-panel"
          role="tabpanel"
          aria-labelledby={`member-profile-tab-${tab}`}
          tabIndex={0}
        >
          {tab === 'info' ? (
            <InfoTab
              member={member}
              lang={lang}
              presence={presence}
              skills={skills}
              canEditProfile={canEditProfile}
              editing={editing}
              onEditingChange={setEditing}
              onSaveDescription={onSaveDescription}
              onSaveSkills={onSaveSkills}
            />
          ) : null}

          {tab === 'activity' ? (
            <ActivityTab groupId={groupId} member={member} canReadAudit={canReadAudit} />
          ) : null}

          {tab === 'access' ? (
            <AccessTab
              member={member}
              presence={presence}
              managedAccount={managedAccount}
              onResetAccess={onResetAccess}
              canManageAccess={canManageAccess}
              onSetAccessEnabled={onSetAccessEnabled}
            />
          ) : null}
        </div>

      </div>
    </GroupDialog>
  )
}

/* ------------------------------------------------------------------ */
/* Tab: information                                                    */
/* ------------------------------------------------------------------ */

function ProfileRow({
  icon: Icon,
  label,
  value,
  action,
}: {
  icon: LucideIcon
  label: string
  value: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border-subtle px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted sm:min-w-40">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words text-sm font-semibold text-ink">{value}</span>
      {action ? (
        <GroupButton variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
        </GroupButton>
      ) : null}
    </div>
  )
}

function InfoTab({
  member,
  lang,
  presence,
  skills,
  canEditProfile,
  editing,
  onEditingChange,
  onSaveDescription,
  onSaveSkills,
}: {
  member: MemberListItem
  lang: string
  presence: { label: string; online: boolean }
  skills: string[]
  canEditProfile: boolean
  editing: 'none' | 'description' | 'skills'
  onEditingChange: (value: 'none' | 'description' | 'skills') => void
  onSaveDescription: (description: string) => Promise<void>
  onSaveSkills: (skills: string) => Promise<void>
}) {
  const { t } = useT()
  const role = roleOf(member)
  const editingDescription = editing === 'description'
  const editingSkills = editing === 'skills'

  return (
    <div className="space-y-4">
      <GroupCard padding="none">
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <UserRound className="h-4 w-4 text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">{t('people.personalInfo')}</h3>
        </div>
        <ProfileRow icon={UserRound} label={t('people.fullName')} value={member.displayName} />
        <ProfileRow
          icon={Copy}
          label={t('people.emailLabel')}
          value={member.email ?? t('people.emailNone')}
        />
        <ProfileRow
          icon={Music4}
          label={t('people.colInstrument')}
          value={skills.length === 0 ? t('people.instrumentNone') : musicalRolesText(member.musicalRole, t)}
        />
        <ProfileRow icon={ROLE_ICON[role]} label={t('people.roleInGroup')} value={t(ROLE_LABEL_KEY[role])} />
        <ProfileRow icon={CalendarDays} label={t('people.joinedLabel')} value={formatDateTime(member.createdAt, lang)} />
        <ProfileRow icon={Activity} label={t('people.colActivity')} value={presence.label} />
      </GroupCard>

      <GroupCard padding="none">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-ink">{t('people.descriptionOptional')}</h3>
          </div>
          {canEditProfile && !editingDescription ? (
            <GroupButton
              variant="secondary"
              size="sm"
              aria-label={t('people.editDescription')}
              onClick={() => onEditingChange('description')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {t('common.edit')}
            </GroupButton>
          ) : null}
        </div>
        {editingDescription ? (
          <DescriptionEditor
            member={member}
            onCancel={() => onEditingChange('none')}
            onSave={onSaveDescription}
          />
        ) : (
          <p className="px-4 pb-4 text-sm text-muted">
            {member.description?.trim()
              ? member.description
              : t('people.descriptionEmpty', { name: member.displayName })}
          </p>
        )}
      </GroupCard>

      <GroupCard padding="none">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-ink">{t('people.skillsInterests')}</h3>
          </div>
          {canEditProfile && !editingSkills ? (
            <GroupButton
              variant="secondary"
              size="sm"
              aria-label={t('people.editSkills')}
              onClick={() => onEditingChange('skills')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {t('common.edit')}
            </GroupButton>
          ) : null}
        </div>
        {editingSkills ? (
          <SkillsEditor
            member={member}
            onCancel={() => onEditingChange('none')}
            onSave={onSaveSkills}
          />
        ) : (
          <div className="px-4 pb-4">
            {skills.length === 0 ? (
              <p className="text-sm text-muted">{t('people.skillsEmpty')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((tag) => (
                  <GroupChip key={tag} tone="accent">
                    {musicalRoleLabel(tag, t)}
                  </GroupChip>
                ))}
              </div>
            )}
          </div>
        )}
      </GroupCard>
    </div>
  )
}

/**
 * Inline editor with the personalization rule: the save action only exists once
 * something actually changed, and "Restablecer" puts the saved value back.
 */
function DescriptionEditor({
  member,
  onCancel,
  onSave,
}: {
  member: MemberListItem
  onCancel: () => void
  onSave: (description: string) => Promise<void>
}) {
  const { t } = useT()
  const saved = member.description ?? ''
  const [value, setValue] = useState(saved)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = value.trim() !== saved.trim()

  async function save() {
    setPending(true)
    setError(null)
    try {
      await onSave(value)
      // Saved: back to read mode, like the personalization editor.
      onCancel()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3 px-4 pb-4">
      <GroupTextArea
        label={t('people.descriptionLabel')}
        value={value}
        maxLength={500}
        disabled={pending}
        onChange={(event) => setValue(event.target.value)}
        hint={t('people.descriptionHint')}
      />
      {error ? <p className="text-sm text-error-ink">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <p className="text-xs text-muted">{dirty ? t('people.unsavedChanges') : t('people.noChanges')}</p>
        {dirty ? (
          <div className="flex items-center gap-2">
            <GroupButton
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setValue(saved)}
            >
              {t('people.reset')}
            </GroupButton>
            <GroupButton size="sm" disabled={pending} onClick={() => void save()}>
              {pending ? t('people.saving') : t('common.save')}
            </GroupButton>
          </div>
        ) : (
          <GroupButton variant="secondary" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </GroupButton>
        )}
      </div>
    </div>
  )
}

function SkillsEditor({
  member,
  onCancel,
  onSave,
}: {
  member: MemberListItem
  onCancel: () => void
  onSave: (skills: string) => Promise<void>
}) {
  const { t } = useT()
  const saved = member.musicalRole ?? ''
  const [value, setValue] = useState(saved)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = normalizeSkills(value) !== normalizeSkills(saved)

  async function save() {
    setPending(true)
    setError(null)
    try {
      await onSave(value)
      // Saved: back to read mode, like the personalization editor.
      onCancel()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3 px-4 pb-4">
      <MusicalRolePicker value={value} disabled={pending} onChange={setValue} />
      {error ? <p className="text-sm text-error-ink">{error}</p> : null}
      <p className="text-xs text-muted">{t('people.instrumentHint')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <p className="text-xs text-muted">{dirty ? t('people.unsavedChanges') : t('people.noChanges')}</p>
        {dirty ? (
          <div className="flex items-center gap-2">
            <GroupButton
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setValue(saved)}
            >
              {t('people.reset')}
            </GroupButton>
            <GroupButton size="sm" disabled={pending} onClick={() => void save()}>
              {pending ? t('people.saving') : t('common.save')}
            </GroupButton>
          </div>
        ) : (
          <GroupButton variant="secondary" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </GroupButton>
        )}
      </div>
    </div>
  )
}

/** Skills are a comma-separated list, so order must not count as a change. */
function normalizeSkills(value: string | null | undefined): string {
  return parseMusicalRoles(value).slice().sort().join(',')
}

/* ------------------------------------------------------------------ */
/* Tab: activity                                                       */
/* ------------------------------------------------------------------ */

const ACTIVITY_LIMIT = 10

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
        <ol className="space-y-2">
          {entries.map((entry) => {
            const meta = auditActionMeta(entry.action)
            const Icon = meta.icon
            return (
              <li key={entry.id}>
                <GroupCard className="flex items-start gap-3" padding="sm">
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                      ACTIVITY_ICON_TONE[entry.action] ?? meta.tone,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{t(meta.labelKey)}</p>
                    <p className="text-xs text-muted">
                      {relativeLabel(entry.createdAt, lang, Date.now())} ·{' '}
                      {formatDateTime(entry.createdAt, lang)}
                    </p>
                  </div>
                </GroupCard>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tab: access                                                         */
/* ------------------------------------------------------------------ */

function AccessTab({
  member,
  presence,
  managedAccount,
  onResetAccess,
  canManageAccess,
  onSetAccessEnabled,
}: {
  member: MemberListItem
  presence: { label: string; online: boolean }
  managedAccount: { memberId: string; handle: string | null } | null
  onResetAccess: () => void
  canManageAccess: boolean
  onSetAccessEnabled: (enabled: boolean) => Promise<void>
}) {
  const { t, lang } = useT()
  const [savingAccess, setSavingAccess] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const accessEnabled = member.accessEnabled !== false

  const changeAccess = async () => {
    setSavingAccess(true)
    setAccessError(null)
    try {
      await onSetAccessEnabled(!accessEnabled)
    } catch {
      setAccessError(t('people.accessChangeError'))
    } finally {
      setSavingAccess(false)
    }
  }

  return (
    <div className="space-y-4">
      <GroupCard padding="none">
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">{t('people.accessTitle')}</h3>
        </div>
        <ProfileRow icon={ShieldCheck} label={t('people.accessState')} value={t(accessEnabled ? 'people.accessEnabled' : 'people.accessDisabled')} />
        <ProfileRow
          icon={Activity}
          label={t('people.accessLastSeen')}
          value={member.lastSeenAt ? formatDateTime(member.lastSeenAt, lang) : t('people.neverSeen')}
        />
        {managedAccount ? (
          <ProfileRow
            icon={KeyRound}
            label={t('people.accessHandle')}
            value={managedAccount.handle ?? '—'}
          />
        ) : null}
      </GroupCard>

      {canManageAccess && roleOf(member) !== 'Owner' ? (
        <GroupCard className="space-y-3" padding="sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{t(accessEnabled ? 'people.accessDeactivate' : 'people.accessReactivate')}</p>
              <p className="text-xs text-muted">{t('people.accessScopeHint')}</p>
            </div>
          </div>
          {accessError ? <p role="alert" className="text-sm text-error-ink">{accessError}</p> : null}
          <GroupButton variant={accessEnabled ? 'danger' : 'primary'} disabled={savingAccess} onClick={() => void changeAccess()}>
            {savingAccess ? t('profile.saving') : t(accessEnabled ? 'people.accessDeactivateAction' : 'people.accessReactivateAction')}
          </GroupButton>
        </GroupCard>
      ) : roleOf(member) === 'Owner' ? (
        <p className="text-xs text-muted">{t('people.accessOwnerProtected')}</p>
      ) : (
        <p className="text-xs text-muted">{t('people.accessScopeHint')}</p>
      )}
    </div>
  )
}
