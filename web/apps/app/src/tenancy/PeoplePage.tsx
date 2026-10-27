import { routes } from '../routing/routes'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useGroupShell } from '../shell/GroupShellContext'
import {
  Check,
  Crown,
  KeyRound,
  Mail,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  changeMemberRole,
  createInvitation,
  fetchFeatures,
  leaveGroup,
  listInvitations,
  listMembers,
  listRoster,
  listGroupRoles,
  removeMember,
  revokeInvitation,
  setMemberGroupRole,
  setMemberDescription,
  setMemberAccessEnabled,
  setMemberMusicalRole,
  type CurrentUser,
  type GroupRole,
  type MemberListItem,
  type OutstandingInvitation,
  type RosterListItem,
} from '../api/client'
import { useT, type I18nKey, type TParams } from '../i18n'
import {
  canManageContentRole,
  formatMembershipRole,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import { cn } from '../ui/cn'
import { useToast } from '../ui/toast'
import { GroupRosterDialog } from '../groups/GroupRosterDialog'
import { GroupRoleSelect } from '../groups/roles/GroupRoleSelect'
import { MemberProfileDialog } from '../groups/MemberProfileDialog'
import { MemberProfileEditDialog } from '../groups/MemberProfileEditDialog'
import { RosterPersonProfileDialog } from '../groups/RosterPersonProfileDialog'
import {
  MusicalRolePicker,
  musicalRoleLabel,
  musicalRolesText,
  parseMusicalRoles,
} from '../groups/MusicalRoleChips'
import {
  GroupActionMenu,
  GroupButton,
  GroupCard,
  GroupChip,
  GroupDialog,
  GroupEmptyState,
  GroupErrorState,
  GroupInput,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  GroupPageSkeleton,
  GroupSection,
  GroupSelect,
  useGroupDataSignal,
  type GroupActionMenuItem,
} from '../groups/ui'

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

type MembershipRole = 'Owner' | 'Manager' | 'Member' | 'Viewer'
type PeopleTab = 'roster' | 'invitations'

type RoleOption = {
  value: MembershipRole
  labelKey: I18nKey
  descriptionKey: I18nKey
  icon: LucideIcon
}

/**
 * Base roles (ADR-0012/0051). Only the label and description are editorial:
 * the server remains the single source of truth for what a role may do, so the
 * page never derives permissions from this list.
 */
const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    value: 'Owner',
    labelKey: 'roles.roleOwner',
    descriptionKey: 'roles.roleOwnerDesc',
    icon: Crown,
  },
  {
    value: 'Manager',
    labelKey: 'roles.roleManager',
    descriptionKey: 'roles.roleManagerDesc',
    icon: ShieldCheck,
  },
  {
    value: 'Member',
    labelKey: 'roles.roleMember',
    descriptionKey: 'roles.roleMemberDesc',
    icon: Users,
  },
  {
    value: 'Viewer',
    labelKey: 'roles.roleViewer',
    descriptionKey: 'roles.roleViewerDesc',
    icon: UserRound,
  },
]

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

/** Chip tones taken from the shared group tokens (AA-safe in light and dark). */
const ROLE_TONE: Record<MembershipRole, 'accent' | 'neutral' | 'outline'> = {
  Owner: 'accent',
  Manager: 'neutral',
  Member: 'neutral',
  Viewer: 'outline',
}

const AVATAR_TONES = [
  'bg-primary/15 text-primary-ink',
  'bg-success/20 text-success-ink',
  'bg-warning/20 text-ink',
  'bg-error/15 text-error-ink',
] as const

type TFunction = (key: I18nKey, params?: TParams) => string

function isMembershipRole(value: string | undefined): value is MembershipRole {
  return value === 'Owner' || value === 'Manager' || value === 'Member' || value === 'Viewer'
}

function roleOf(member: MemberListItem): MembershipRole {
  return isMembershipRole(member.role) ? member.role : 'Member'
}

/** "Carlos King" → "CK"; deterministic tone so a person keeps the same avatar. */
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

/** Presence is the member's last seen timestamp (ADR-0051 heartbeat). */
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
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function PeoplePage({ user }: { user: CurrentUser }) {
  const { groupId, navigate } = useGroupShell()
  const { t, lang } = useT()
  const { showToast } = useToast()
  const { group, error: groupError } = useGroupContext(groupId, user.id)

  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  const [tab, setTab] = useState<PeopleTab>('roster')
  const [roleFilter, setRoleFilter] = useState<'all' | MembershipRole>('all')
  const [instrumentFilter, setInstrumentFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [listError, setListError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [invites, setInvites] = useState<OutstandingInvitation[] | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteFlowError, setInviteFlowError] = useState<string | null>(null)
  const [inviteWarning, setInviteWarning] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [resetMember, setResetMember] = useState<{ memberId: string; displayName: string } | null>(
    null,
  )
  const [rosterByUser, setRosterByUser] = useState<Record<string, RosterListItem>>({})
  const [rosterPeople, setRosterPeople] = useState<RosterListItem[]>([])
  const [rosterProfile, setRosterProfile] = useState<RosterListItem | null>(null)
  const [rosterReloadKey, setRosterReloadKey] = useState(0)
  const [managedEnabled, setManagedEnabled] = useState(false)
  const [groupRoles, setGroupRoles] = useState<GroupRole[] | null>(null)
  const [groupRoleMember, setGroupRoleMember] = useState<MemberListItem | null>(null)
  const [profileMember, setProfileMember] = useState<MemberListItem | null>(null)
  const [editProfileMember, setEditProfileMember] = useState<MemberListItem | null>(null)
  const [roleMember, setRoleMember] = useState<MemberListItem | null>(null)
  const [instrumentMember, setInstrumentMember] = useState<MemberListItem | null>(null)
  const [removeTarget, setRemoveTarget] = useState<MemberListItem | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<OutstandingInvitation | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchFeatures()
      .then((flags) => {
        if (!cancelled) setManagedEnabled(flags.managedAccounts)
      })
      .catch(() => {
        if (!cancelled) setManagedEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isOwner = isOwnerRole(group?.role)
  const canManage = canManageContentRole(group?.role)

  async function reloadMembers() {
    if (!groupId) return
    setRosterReloadKey((key) => key + 1)
    setListError(null)
    try {
      setMembers(await listMembers(groupId))
    } catch (err) {
      setMembers([])
      setListError(mutationErrorMessage(err, t))
    }
  }

  // Live refresh when members change elsewhere (invite, role change, leave).
  useGroupDataSignal('members', groupId, reloadMembers)

  // Group-defined roles (ADR-0080) so a member can be assigned one.
  useEffect(() => {
    if (!groupId || !isOwner) return
    let cancelled = false
    void listGroupRoles(groupId)
      .then((items) => {
        if (!cancelled) setGroupRoles(items)
      })
      .catch(() => {
        if (!cancelled) setGroupRoles([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId, isOwner])

  // Roster identity is separate from account identity; missing UserId means no access.
  useEffect(() => {
    setRosterPeople([])
    setRosterByUser({})
    if (!groupId || !managedEnabled || !group) return
    let cancelled = false
    void listRoster(groupId)
      .then((items) => {
        if (cancelled) return
        setRosterPeople(items.filter((item) => !item.userId && !item.hasAccess))
        const map: Record<string, RosterListItem> = {}
        for (const item of items) {
          if (item.userId && item.hasAccess && item.handle) map[item.userId] = item
        }
        setRosterByUser(map)
      })
      .catch(() => {
        if (!cancelled) setRosterByUser({})
      })
    return () => {
      cancelled = true
    }
  }, [groupId, group?.role, managedEnabled, rosterReloadKey])

  useEffect(() => {
    if (!groupId || !group) return
    const ownerView = isOwnerRole(group.role)
    let cancelled = false

    async function load() {
      setMembers(null)
      setListError(null)
      setActionError(null)
      try {
        const result = await listMembers(groupId!)
        if (!cancelled) setMembers(result)
      } catch (err) {
        if (cancelled) return
        setMembers([])
        setListError(mutationErrorMessage(err, t))
      }
    }

    async function loadInvites() {
      if (!ownerView) {
        setInvites([])
        return
      }
      setInvites(null)
      setInviteError(null)
      try {
        const result = await listInvitations(groupId!)
        if (!cancelled) setInvites(result)
      } catch (err) {
        if (cancelled) return
        setInvites([])
        setInviteError(mutationErrorMessage(err, t))
      }
    }

    void load()
    void loadInvites()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  async function onChangeRole(targetUserId: string, role: MembershipRole, displayName: string) {
    if (!groupId) return
    setPendingUserId(targetUserId)
    setActionError(null)
    try {
      await changeMemberRole(groupId, targetUserId, role)
      await reloadMembers()
      showToast({
        kind: 'ok',
        text: t('people.toastRoleChanged', {
          name: displayName,
          role: formatMembershipRole(role, t),
        }),
      })
    } catch (err) {
      setActionError(mutationErrorMessage(err, t))
    } finally {
      setPendingUserId(null)
    }
  }

  async function onSetMusicalRole(
    targetUserId: string,
    musicalRole: string,
    displayName: string,
  ) {
    if (!groupId) return
    setPendingUserId(targetUserId)
    setActionError(null)
    try {
      await setMemberMusicalRole(groupId, targetUserId, musicalRole.trim() === '' ? null : musicalRole.trim())
      await reloadMembers()
      showToast({ kind: 'ok', text: t('people.toastInstrumentChanged', { name: displayName }) })
    } catch (err) {
      setActionError(mutationErrorMessage(err, t))
    } finally {
      setPendingUserId(null)
    }
  }

  async function onAssignGroupRole(targetUserId: string, roleId: string | null) {
    if (!groupId) return
    setPendingUserId(targetUserId)
    setActionError(null)
    try {
      await setMemberGroupRole(groupId, targetUserId, roleId)
      await reloadMembers()
    } catch (err) {
      setActionError(mutationErrorMessage(err, t))
    } finally {
      setPendingUserId(null)
    }
  }

  /**
   * Saves the member description from the profile's inline editor. The editor
   * owns its own pending state, so this only throws on failure and lets the
   * error surface in place.
   */
  async function onSaveDescription(target: MemberListItem, description: string) {
    if (!groupId) return
    await setMemberDescription(
      groupId,
      target.userId,
      description.trim() === '' ? null : description.trim(),
    )
    // The profile renders the member it was opened with, so re-read the roster
    // and keep the dialog pointed at the fresh row.
    const refreshed = await listMembers(groupId)
    setMembers(refreshed)
    const updated = refreshed.find((item) => item.userId === target.userId) ?? null
    if (updated) setProfileMember((current) => current?.userId === target.userId ? updated : current)
    showToast({ kind: 'ok', text: t('people.toastDescriptionSaved', { name: target.displayName }) })
  }

  async function saveProfileSkills(target: MemberListItem, skills: string) {
    if (!groupId) return
    await setMemberMusicalRole(groupId, target.userId, skills.trim() || null)
    const refreshed = await listMembers(groupId)
    setMembers(refreshed)
    const updated = refreshed.find((item) => item.userId === target.userId)
    if (updated) setProfileMember((current) => current?.userId === target.userId ? updated : current)
  }

  async function onRemove(targetUserId: string, displayName: string) {
    if (!groupId) return
    setPendingUserId(targetUserId)
    setActionError(null)
    try {
      await removeMember(groupId, targetUserId)
      setRemoveTarget(null)
      await reloadMembers()
      showToast({ kind: 'ok', text: t('people.toastMemberRemoved', { name: displayName }) })
    } catch (err) {
      setActionError(mutationErrorMessage(err, t))
    } finally {
      setPendingUserId(null)
    }
  }

  async function onRevoke(invitationId: string) {
    if (!groupId) return
    setRevokingId(invitationId)
    setInviteError(null)
    try {
      await revokeInvitation(groupId, invitationId)
      setRevokeTarget(null)
      setInvites(await listInvitations(groupId))
      showToast({ kind: 'ok', text: t('people.toastInviteCancelled') })
    } catch (err) {
      setInviteError(mutationErrorMessage(err, t))
    } finally {
      setRevokingId(null)
    }
  }

  function openInviteDialog() {
    setInviteEmail('')
    setInviteUrl(null)
    setInviteFlowError(null)
    setInviteWarning(false)
    setCopied(false)
    setInviteOpen(true)
  }

  async function onInviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!groupId) return
    setInviting(true)
    setInviteFlowError(null)
    setInviteWarning(false)
    setCopied(false)
    try {
      const created = await createInvitation(groupId, inviteEmail)
      setInviteUrl(`${window.location.origin}${routes.joinInvitation(created.token)}`)
      if (inviteEmail.trim() && !created.emailed) setInviteWarning(true)
      setInvites(await listInvitations(groupId))
    } catch (err) {
      setInviteFlowError(mutationErrorMessage(err, t))
    } finally {
      setInviting(false)
    }
  }

  async function onCopyInviteLink() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function onLeave() {
    if (!groupId) return
    setLeaving(true)
    setActionError(null)
    try {
      await leaveGroup(groupId)
      navigate(routes.home)
    } catch (err) {
      setActionError(mutationErrorMessage(err, t))
    } finally {
      setLeaving(false)
    }
  }

  const instrumentOptions = useMemo(() => {
    const tags = new Set<string>()
    for (const member of members ?? []) {
      for (const tag of parseMusicalRoles(member.musicalRole)) tags.add(tag)
    }
    return [...tags].sort((a, b) => musicalRoleLabel(a, t).localeCompare(musicalRoleLabel(b, t), lang))
  }, [members, t, lang])

  const visibleMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return (members ?? [])
      .filter((member) => roleFilter === 'all' || member.role === roleFilter)
      .filter((member) =>
        instrumentFilter ? parseMusicalRoles(member.musicalRole).includes(instrumentFilter) : true,
      )
      .filter((member) => {
        if (!query) return true
        return (
          member.displayName.toLowerCase().includes(query) ||
          (member.email ?? '').toLowerCase().includes(query) ||
          musicalRolesText(member.musicalRole, t).toLowerCase().includes(query)
        )
      })
  }, [members, roleFilter, instrumentFilter, searchQuery, t])

  const filtersActive =
    roleFilter !== 'all' || instrumentFilter !== '' || searchQuery.trim() !== ''

  function clearFilters() {
    setRoleFilter('all')
    setInstrumentFilter('')
    setSearchQuery('')
  }

  /**
   * Row menu: "Ver perfil" plus everything the caller may do to this person.
   *
   * Actions opened from here stack on top of whatever is already open (the row
   * menu has nothing behind it); the ones opened from the member profile reuse
   * this same list, and there the profile must stay behind the action dialog.
   */
  function menuItemsFor(member: MemberListItem): GroupActionMenuItem[] {
    return [
      {
        key: 'profile',
        label: t('people.viewProfile'),
        icon: UserRound,
        onSelect: () => setProfileMember(member),
      },
      ...memberActionItems(member),
    ]
  }

  function memberActionItems(member: MemberListItem): GroupActionMenuItem[] {
    const items: GroupActionMenuItem[] = []
    if (isOwner && !isSelfMember(member, user.id)) {
      items.push({
        key: 'role',
        label: t('people.changeRole'),
        icon: ShieldCheck,
        onSelect: () => setRoleMember(member),
      })
    }
    if (canManage) {
      items.push({
        key: 'edit',
        label: t('people.editProfile'),
        icon: Pencil,
        onSelect: () => setEditProfileMember(member),
      })
      items.push({
        key: 'instrument',
        label: t('people.editInstrument'),
        icon: Pencil,
        onSelect: () => setInstrumentMember(member),
      })
    }
    if (isOwner && !isSelfMember(member, user.id) && (groupRoles?.length ?? 0) > 0) {
      items.push({
        key: 'groupRole',
        label: t('groupRole.assign'),
        icon: ShieldCheck,
        onSelect: () => setGroupRoleMember(member),
      })
    }
    if (isOwner && !isSelfMember(member, user.id) && rosterByUser[member.userId]) {
      items.push({
        key: 'access',
        label: t('roster.reset'),
        icon: KeyRound,
        onSelect: () => {
          const account = rosterByUser[member.userId]
          if (!account) return
          setResetMember({ memberId: account.memberId, displayName: member.displayName })
          setRosterOpen(true)
        },
      })
    }
    if (isOwner && !isSelfMember(member, user.id)) {
      items.push({
        key: 'remove',
        label: t('people.removeMember'),
        icon: Trash2,
        danger: true,
        onSelect: () => setRemoveTarget(member),
      })
    }
    return items.map((item, index) => ({ ...item, separatorBefore: index > 0 }))
  }

  const visibleRosterPeople = rosterPeople.filter((person) =>
    (roleFilter === 'all' || person.role === roleFilter) && !instrumentFilter &&
    (!searchQuery.trim() || person.displayName.toLocaleLowerCase(lang).includes(searchQuery.trim().toLocaleLowerCase(lang))))

  if (group === undefined) {
    return <GroupPageSkeleton label={t('people.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} />
        <GroupLink variant="secondary" to={routes.home}>
          {t('people.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const totalMembers = members?.length ?? 0

  return (
    <section className="space-y-6" aria-labelledby="people-heading">
      <GroupPageHeader
        headingId="people-heading"
        icon={Users}
        title={t('people.title')}
        subtitle={t('people.subtitle')}
        breadcrumb={[{ to: routes.group(group.id), label: group.name }, { label: t('people.title') }]}
        actions={
          isOwner ? (
            <GroupButton onClick={() => setAddOpen(true)} className="whitespace-nowrap">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {t('addMember.button')}
            </GroupButton>
          ) : null
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t('people.title')}>
            <PeopleTab
              active={tab === 'roster'}
              label={t('people.tabAll')}
              count={members === null ? undefined : totalMembers}
              onClick={() => setTab('roster')}
            />
            {isOwner ? (
              <PeopleTab
                active={tab === 'invitations'}
                label={t('people.tabInvites')}
                count={invites === null ? undefined : invites.length}
                onClick={() => setTab('invitations')}
              />
            ) : null}
          </div>

          {tab === 'roster' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="min-w-0 sm:min-w-56 sm:flex-1">
                <label className="sr-only" htmlFor="people-search">
                  {t('people.searchLabel')}
                </label>
                <GroupInput
                  id="people-search"
                  type="search"
                  data-testid="people-search"
                  aria-label={t('people.searchLabel')}
                  placeholder={t('people.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="min-h-11"
                  maxLength={200}
                />
              </div>
              {/* The two filters share one row on phones instead of wrapping. */}
              <div className="flex items-center gap-2">
                <GroupSelect
                  aria-label={t('people.filterRole')}
                  className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                  value={roleFilter}
                  onChange={(next) => setRoleFilter(next === 'all' ? 'all' : (next as MembershipRole))}
                  options={[
                    { value: 'all', label: t('people.filterAll') },
                    ...ROLE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: t(option.labelKey),
                    })),
                  ]}
                />
                <GroupSelect
                  aria-label={t('people.filterInstrument')}
                  className="min-w-0 flex-1 sm:w-48 sm:flex-none"
                  value={instrumentFilter}
                  onChange={setInstrumentFilter}
                  placeholder={t('people.filterInstrument')}
                  options={[
                    { value: '', label: t('people.filterAll') },
                    ...instrumentOptions.map((tag) => ({
                      value: tag,
                      label: musicalRoleLabel(tag, t),
                    })),
                  ]}
                />
              </div>
              {filtersActive ? (
                <GroupButton variant="ghost" onClick={clearFilters} className="self-start sm:self-auto">
                  <X className="h-4 w-4" aria-hidden="true" />
                  {t('people.clearFilters')}
                </GroupButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </GroupPageHeader>

      <GroupErrorState message={listError} />
      <GroupErrorState message={actionError} />
      <GroupErrorState message={inviteError} />

      {tab === 'invitations' ? (
        <GroupSection
          title={t('people.invitesTitle')}
          headingId="invites-heading"
          description={t('people.invitesHint')}
        >
          {invites === null ? (
            <GroupListSkeleton rows={2} label={t('people.loadingInvites')} />
          ) : invites.length === 0 ? (
            <GroupEmptyState icon={Mail} title={t('people.noInvites')} />
          ) : (
            <GroupCard padding="none">
              <ul className="divide-y divide-border-subtle">
                {invites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-hover text-muted"
                        aria-hidden="true"
                      >
                        <Mail className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{t('people.inviteItem')}</p>
                        <p className="text-xs text-muted">
                          {t('people.inviteCreatedPrefix')}
                          {formatDateTime(invite.createdAt, lang)} · {t('people.expiresPrefix')}
                          {formatDateTime(invite.expiresAt, lang)}
                        </p>
                      </div>
                    </div>
                    <GroupButton
                      variant="danger"
                      size="sm"
                      disabled={revokingId === invite.id}
                      onClick={() => setRevokeTarget(invite)}
                    >
                      {t('people.cancelInvite')}
                    </GroupButton>
                  </li>
                ))}
              </ul>
            </GroupCard>
          )}
        </GroupSection>
      ) : members === null ? (
        <GroupListSkeleton rows={3} label={t('people.loading')} />
      ) : visibleMembers.length === 0 && visibleRosterPeople.length > 0 ? null : visibleMembers.length === 0 ? (
        <GroupEmptyState
          icon={members.length === 0 ? Users : Search}
          title={members.length === 0 ? t('people.emptyTitle') : t('people.noFilterTitle')}
          description={members.length === 0 ? t('people.emptyBody') : t('people.noFilterBody')}
          action={
            members.length === 0 ? undefined : (
              <GroupButton variant="secondary" onClick={clearFilters}>
                {t('people.clearFilters')}
              </GroupButton>
            )
          }
        />
      ) : (
        <div className="space-y-2" role="tabpanel" aria-label={t('people.tabAll')}>
          {/* Phones and tablets: one card per person. A five-column table would
              force horizontal scrolling on anything under ~1024px. */}
          <ul className="space-y-2 lg:hidden">
            {visibleMembers.map((member, index) => (
              <MemberCard
                key={member.userId}
                member={member}
                groupRoles={groupRoles ?? []}
                isSelf={isSelfMember(member, user.id)}
                busy={pendingUserId === member.userId}
                menuItems={menuItemsFor(member)}
              />
            ))}
          </ul>

          {/* Desktop: the dense table. */}
          <GroupCard padding="none" className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <caption className="sr-only">{t('people.title')}</caption>
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {t('people.colMember')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {t('people.colRole')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {t('people.colInstrument')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {t('people.colActivity')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">{t('people.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMembers.map((member) => (
                    <MemberRow
                      key={member.userId}
                      member={member}
                      groupRoles={groupRoles ?? []}
                      isSelf={isSelfMember(member, user.id)}
                      busy={pendingUserId === member.userId}
                      menuItems={menuItemsFor(member)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </GroupCard>
          <p className="px-1 text-xs text-muted">
            {t(totalMembers === 1 ? 'people.showingCountOne' : 'people.showingCount', {
              shown: visibleMembers.length,
              total: totalMembers,
            })}
          </p>
        </div>
      )}

      {tab === 'roster' && visibleRosterPeople.length > 0 ? (
        <section className="space-y-2" aria-label={t('people.rosterOnly')}>
          <h2 className="text-sm font-semibold text-muted">{t('people.rosterOnly')}</h2>
          <ul className="space-y-2">
            {visibleRosterPeople.map((person) => (
              <li key={person.memberId}>
                <button type="button" onClick={() => setRosterProfile(person)}
                  className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface p-3 text-left text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary">
                  <span className="min-w-0 break-words font-medium text-ink">{person.displayName}</span>
                  <span className="text-xs text-muted">{t('people.viewProfile')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rosterProfile ? <RosterPersonProfileDialog person={rosterProfile} onClose={() => setRosterProfile(null)} /> : null}

      {isOwner ? null : (
        <GroupButton variant="secondary" disabled={leaving} onClick={() => void onLeave()}>
          {leaving ? t('people.leaving') : t('people.leave')}
        </GroupButton>
      )}

      {isOwner && addOpen ? (
        <GroupDialog
          open
          onClose={() => setAddOpen(false)}
          title={t('addMember.title')}
          description={t('addMember.hint')}
          testId="add-member-dialog"
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setAddOpen(false)
                openInviteDialog()
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 text-left transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-ink"
                aria-hidden="true"
              >
                <UserPlus className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {t('addMember.withAccount')}
                </span>
                {/* The hint is the part that needs the room, so it only shows
                    where there is room for it. */}
                <span className="hidden text-xs text-muted sm:block">
                  {t('addMember.withAccountHint')}
                </span>
              </span>
            </button>
            {managedEnabled ? (
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false)
                  setResetMember(null)
                  setRosterOpen(true)
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 text-left transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-ink"
                  aria-hidden="true"
                >
                  <KeyRound className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {t('addMember.withoutAccount')}
                  </span>
                  <span className="hidden text-xs text-muted sm:block">
                    {t('addMember.withoutAccountHint')}
                  </span>
                </span>
              </button>
            ) : null}
          </div>
        </GroupDialog>
      ) : null}

      {isOwner ? (
        <GroupDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          title={t('dashboard.inviteTitle')}
          onSubmit={(event) => void onInviteMember(event)}
          pending={inviting}
          testId="invite-member-dialog"
          footer={
            <>
              <GroupButton
                variant="secondary"
                type="button"
                disabled={inviting}
                onClick={() => setInviteOpen(false)}
              >
                {t('common.close')}
              </GroupButton>
              <GroupButton type="submit" disabled={inviting}>
                {inviting ? t('dashboard.working') : t('dashboard.invite')}
              </GroupButton>
            </>
          }
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t('dashboard.inviteEmail')}</span>
            <GroupInput
              type="email"
              autoComplete="off"
              aria-label={t('dashboard.inviteEmail')}
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </label>
          <ProblemAlert message={inviteFlowError} />
          {inviteWarning ? (
            <p
              role="status"
              className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-ink"
            >
              {t('dashboard.inviteMailWarning')}
            </p>
          ) : null}
          {inviteUrl ? (
            <div className="space-y-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('dashboard.inviteLinkLabel')}</span>
                <GroupInput readOnly aria-label={t('dashboard.inviteLinkLabel')} value={inviteUrl} />
              </label>
              <GroupButton variant="secondary" type="button" onClick={() => void onCopyInviteLink()}>
                {t('dashboard.copyLink')}
              </GroupButton>
              {copied ? (
                <p aria-live="polite" className="text-sm text-muted">
                  {t('dashboard.copied')}
                </p>
              ) : null}
            </div>
          ) : null}
        </GroupDialog>
      ) : null}

      {rosterOpen ? (
        <GroupRosterDialog
          groupId={group.id}
          groupSlug={group.slug ?? null}
          resetMember={resetMember}
          onClose={() => {
            setRosterOpen(false)
            setResetMember(null)
          }}
          onChanged={() => void reloadMembers()}
        />
      ) : null}

      {profileMember ? (
        <MemberProfileDialog
          key={profileMember.userId}
          viewerUserId={user.id}
          member={profileMember}
          groupId={group.id}
          canReadAudit={isOwner}
          canEditProfile={canManage}
          canManageAccess={isOwner}
          menuItems={memberActionItems(profileMember)}
          managedAccount={
            rosterByUser[profileMember.userId]
              ? {
                  memberId: rosterByUser[profileMember.userId]!.memberId,
                  handle: rosterByUser[profileMember.userId]!.handle,
                }
              : null
          }
          onClose={() => setProfileMember(null)}
          onEditProfile={() => setEditProfileMember(profileMember)}
          onSaveDescription={async (description) => {
            await onSaveDescription(profileMember, description)
          }}
          onSaveSkills={async (skills) => {
            await saveProfileSkills(profileMember, skills)
          }}
          onResetAccess={() => {
            const account = rosterByUser[profileMember.userId]
            if (!account) return
            setProfileMember(null)
            setResetMember({
              memberId: account.memberId,
              displayName: profileMember.displayName,
            })
            setRosterOpen(true)
          }}
          onSetAccessEnabled={async (enabled) => {
            await setMemberAccessEnabled(group.id, profileMember.userId, enabled)
            setProfileMember((current) => current?.userId === profileMember.userId
              ? { ...current, accessEnabled: enabled }
              : current)
            await reloadMembers()
          }}
        />
      ) : null}

      {editProfileMember && canManage ? (
        <MemberProfileEditDialog
          key={editProfileMember.userId}
          member={editProfileMember}
          onClose={() => setEditProfileMember(null)}
          onSaveDescription={(description) => onSaveDescription(editProfileMember, description)}
          onSaveSkills={(skills) => saveProfileSkills(editProfileMember, skills)}
        />
      ) : null}

      {roleMember ? (
        <ChangeRoleDialog
          member={roleMember}
          pending={pendingUserId === roleMember.userId}
          onClose={() => setRoleMember(null)}
          onSubmit={(role) => void onChangeRole(roleMember.userId, role, roleMember.displayName)}
        />
      ) : null}

      {groupRoleMember ? (
        <GroupDialog
          open
          onClose={() => setGroupRoleMember(null)}
          title={t('groupRole.assignTitle', { name: groupRoleMember.displayName })}
          description={t('groupRole.assignHint')}
          testId="assign-group-role-dialog"
          footer={
            <GroupButton variant="secondary" onClick={() => setGroupRoleMember(null)}>
              {t('common.close')}
            </GroupButton>
          }
        >
          <GroupRoleSelect
            roles={groupRoles}
            value={groupRoleMember.groupRoleId ?? null}
            disabled={pendingUserId === groupRoleMember.userId}
            onChange={(roleId) => {
              void onAssignGroupRole(groupRoleMember.userId, roleId).then(() =>
                setGroupRoleMember(null),
              )
            }}
          />
        </GroupDialog>
      ) : null}

      {instrumentMember ? (
        <GroupDialog
          open
          onClose={() => setInstrumentMember(null)}
          title={t('people.editInstrumentTitle')}
          description={t('people.editInstrumentHint', { name: instrumentMember.displayName })}
          testId="edit-instrument-dialog"
          footer={
            <GroupButton variant="secondary" onClick={() => setInstrumentMember(null)}>
              {t('common.close')}
            </GroupButton>
          }
        >
          <MusicalRolePicker
            value={instrumentMember.musicalRole}
            disabled={pendingUserId === instrumentMember.userId}
            onChange={(next) =>
              void onSetMusicalRole(instrumentMember.userId, next, instrumentMember.displayName)
            }
          />
          <p className="text-xs text-muted">{t('people.instrumentHint')}</p>
        </GroupDialog>
      ) : null}

      {removeTarget ? (
        <GroupDialog
          open
          onClose={() => setRemoveTarget(null)}
          title={t('people.confirmRemoveTitle')}
          pending={pendingUserId === removeTarget.userId}
          testId="remove-member-dialog"
          footer={
            <>
              <GroupButton
                variant="secondary"
                disabled={pendingUserId === removeTarget.userId}
                onClick={() => setRemoveTarget(null)}
              >
                {t('common.cancel')}
              </GroupButton>
              <GroupButton
                variant="danger"
                disabled={pendingUserId === removeTarget.userId}
                onClick={() => void onRemove(removeTarget.userId, removeTarget.displayName)}
              >
                {pendingUserId === removeTarget.userId
                  ? t('dashboard.working')
                  : t('people.removeMember')}
              </GroupButton>
            </>
          }
        >
          <div className="flex items-start gap-3 rounded-2xl border border-error/25 bg-error/10 px-4 py-3">
            <TriangleAlert className="h-5 w-5 shrink-0 text-error-ink" aria-hidden="true" />
            <p className="text-sm text-error-ink">
              {t('people.confirmRemoveBody', { name: removeTarget.displayName })}
            </p>
          </div>
        </GroupDialog>
      ) : null}

      {revokeTarget ? (
        <GroupDialog
          open
          onClose={() => setRevokeTarget(null)}
          title={t('people.confirmRevokeTitle')}
          pending={revokingId === revokeTarget.id}
          testId="revoke-invitation-dialog"
          footer={
            <>
              <GroupButton
                variant="secondary"
                disabled={revokingId === revokeTarget.id}
                onClick={() => setRevokeTarget(null)}
              >
                {t('common.cancel')}
              </GroupButton>
              <GroupButton
                variant="danger"
                disabled={revokingId === revokeTarget.id}
                onClick={() => void onRevoke(revokeTarget.id)}
              >
                {revokingId === revokeTarget.id ? t('dashboard.working') : t('people.cancelInvite')}
              </GroupButton>
            </>
          }
        >
          <p className="text-sm text-muted">{t('people.confirmRevokeBody')}</p>
        </GroupDialog>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Roster                                                              */
/* ------------------------------------------------------------------ */

function isSelfMember(member: MemberListItem, userId: string): boolean {
  return member.userId === userId
}

/* Shared pieces: the phone layout and the desktop table must show exactly the
   same facts, so both are composed from these instead of duplicating markup. */

function MemberAvatar({ member }: { member: MemberListItem }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold',
        toneFor(member.userId),
      )}
    >
      {initialsOf(member.displayName)}
    </span>
  )
}

function MemberIdentity({
  member,
  isSelf,
}: {
  member: MemberListItem
  isSelf: boolean
}) {
  const { t } = useT()
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold text-ink">
        {member.displayName}
        {isSelf ? (
          <span className="ml-2 text-xs font-normal text-muted">{t('people.you')}</span>
        ) : null}
      </p>
      <p className="truncate text-xs text-muted">{member.email ?? t('people.emailNone')}</p>
    </div>
  )
}

function MemberRoleChip({
  member,
  groupRoles,
}: {
  member: MemberListItem
  groupRoles: GroupRole[]
}) {
  const { t } = useT()
  const customRole = member.groupRoleId
    ? groupRoles.find((role) => role.id === member.groupRoleId)
    : null
  if (customRole) {
    return (
      <GroupChip tone="accent" icon={ShieldCheck}>
        {customRole.name}
      </GroupChip>
    )
  }
  const role = roleOf(member)
  const RoleIcon = ROLE_ICON[role]
  return (
    <GroupChip tone={ROLE_TONE[role]} icon={RoleIcon}>
      {t(ROLE_LABEL_KEY[role])}
    </GroupChip>
  )
}

function MemberInstruments({ member }: { member: MemberListItem }) {
  const { t } = useT()
  const instruments = parseMusicalRoles(member.musicalRole)
  if (instruments.length === 0) {
    return <span className="text-sm text-muted">{t('people.instrumentNone')}</span>
  }
  return (
    <span className="flex flex-wrap gap-1">
      {instruments.map((tag) => (
        <GroupChip key={tag} tone="outline">
          {musicalRoleLabel(tag, t)}
        </GroupChip>
      ))}
    </span>
  )
}

function MemberPresence({ member }: { member: MemberListItem }) {
  const { t } = useT()
  const presence = presenceOf(member.lastSeenAt, t, Date.now())
  return (
    <span className="flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden="true"
        className={cn('h-2 w-2 shrink-0 rounded-full', presence.online ? 'bg-success' : 'bg-muted')}
      />
      {presence.label}
    </span>
  )
}

/** Phone layout: one card per person, nothing clipped, no horizontal scroll. */
function MemberCard({
  member,
  groupRoles,
  isSelf,
  busy,
  menuItems,
}: {
  member: MemberListItem
  groupRoles: GroupRole[]
  isSelf: boolean
  busy: boolean
  menuItems: GroupActionMenuItem[]
}) {
  const { t } = useT()
  return (
    <li className={cn('library-enter', busy && 'opacity-60')}>
      <GroupCard padding="sm" className="space-y-3">
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} />
          <MemberIdentity member={member} isSelf={isSelf} />
          {menuItems.length > 0 ? (
            <GroupActionMenu
              label={t('people.actionsFor', { name: member.displayName })}
              items={menuItems}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <MemberRoleChip member={member} groupRoles={groupRoles} />
          <MemberInstruments member={member} />
        </div>
        <MemberPresence member={member} />
      </GroupCard>
    </li>
  )
}

/** Desktop layout: the dense table, only rendered from `lg` upwards. */
function MemberRow({
  member,
  groupRoles,
  isSelf,
  busy,
  menuItems,
}: {
  member: MemberListItem
  groupRoles: GroupRole[]
  isSelf: boolean
  busy: boolean
  menuItems: GroupActionMenuItem[]
}) {
  const { t } = useT()
  return (
    <tr
      className={cn(
        'border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-hover',
        busy && 'opacity-60',
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} />
          <MemberIdentity member={member} isSelf={isSelf} />
        </div>
      </td>
      <td className="px-4 py-3">
        <MemberRoleChip member={member} groupRoles={groupRoles} />
      </td>
      <td className="px-4 py-3">
        <MemberInstruments member={member} />
      </td>
      <td className="px-4 py-3">
        <MemberPresence member={member} />
      </td>
      <td className="px-2 py-3 text-right">
        {menuItems.length > 0 ? (
          <GroupActionMenu
            label={t('people.actionsFor', { name: member.displayName })}
            items={menuItems}
          />
        ) : null}
      </td>
    </tr>
  )
}

function PeopleTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'sonivo-tab-trigger transition-colors',
        active ? '' : 'text-muted hover:text-ink',
      )}
    >
      {label}
      {count === undefined ? null : (
        <span className={cn('ml-1.5 text-xs', active ? 'text-primary-foreground/80' : 'text-muted')}>
          {count}
        </span>
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

/** Role change is one action with one confirmation; permissions stay in Roles. */
function ChangeRoleDialog({
  member,
  pending,
  onClose,
  onSubmit,
}: {
  member: MemberListItem
  pending: boolean
  onClose: () => void
  onSubmit: (role: MembershipRole) => void
}) {
  const { t } = useT()
  const [selected, setSelected] = useState<MembershipRole>(roleOf(member))
  const unchanged = selected === roleOf(member)

  return (
    <GroupDialog
      open
      onClose={onClose}
      title={t('people.changeRoleTitle')}
      description={t('people.changeRoleHint', { name: member.displayName })}
      pending={pending}
      testId="change-role-dialog"
      footer={
        <>
          <GroupButton variant="secondary" disabled={pending} onClick={onClose}>
            {t('common.cancel')}
          </GroupButton>
          <GroupButton disabled={pending || unchanged} onClick={() => onSubmit(selected)}>
            {pending ? t('people.changeRolePending') : t('people.changeRoleConfirm')}
          </GroupButton>
        </>
      }
    >
      <ul className="space-y-2" role="radiogroup" aria-label={t('people.changeRoleTitle')}>
        {ROLE_OPTIONS.map((option) => {
          const active = selected === option.value
          const Icon = option.icon
          return (
            <li key={option.value}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(option.value)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  active
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border-subtle bg-surface hover:border-primary/30 hover:bg-surface-hover',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                    active ? 'bg-primary/15 text-primary-ink' : 'bg-surface-hover text-muted',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{t(option.labelKey)}</span>
                  <span className="block text-xs text-muted">{t(option.descriptionKey)}</span>
                </span>
                {active ? (
                  <Check className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted">{t('people.changeRoleFooterHint')}</p>
    </GroupDialog>
  )
}
