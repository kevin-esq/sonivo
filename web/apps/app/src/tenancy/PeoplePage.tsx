import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { KeyRound, UserPlus, UserRound, Users } from 'lucide-react'
import {
  changeMemberRole,
  createInvitation,
  fetchFeatures,
  leaveGroup,
  listRoster,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
  setMemberMusicalRole,
  type CurrentUser,
  type MemberListItem,
  type OutstandingInvitation,
} from '../api/client'
import { useT, type I18nKey, type TParams } from '../i18n'
import {
  canManageContentRole,
  isOwnerRole,
  formatMembershipRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import { cn } from '../ui/cn'
import { GroupRosterDialog } from '../groups/GroupRosterDialog'
import {
  GroupButton,
  GroupCard,
  GroupEmptyState,
  GroupErrorState,
  GroupDialog,
  GroupIconWell,
  GroupInput,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  GroupPageSkeleton,
  GroupSection,
  GroupSelect,
  useGroupDataSignal,
} from '../groups/ui'

function formatRole(role: string, t: (key: I18nKey) => string): string {
  return formatMembershipRole(role, t)
}

type RoleTab = 'all' | 'admins' | 'leaders' | 'members'

function roleTabOf(role: string): RoleTab {
  switch (role) {
    case 'Owner':
      return 'admins'
    case 'Manager':
      return 'leaders'
    default:
      return 'members'
  }
}

function presenceLabel(
  lastSeenAt: string | null | undefined,
  t: (key: I18nKey, params?: TParams) => string,
  now: number,
): string {
  if (!lastSeenAt) return t('people.neverSeen')
  const diffMs = now - new Date(lastSeenAt).getTime()
  if (Number.isNaN(diffMs) || diffMs < 5 * 60 * 1000) return t('people.online')
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 24) return t('people.lastSeenHours', { count: hours })
  return t('people.lastSeenDays', { count: Math.floor(hours / 24) })
}

export function PeoplePage({ user, roleFilter }: { user: CurrentUser; roleFilter?: string }) {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  const [roleTab, setRoleTab] = useState<RoleTab>(
    roleFilter === 'admins' || roleFilter === 'leaders' || roleFilter === 'members' ? roleFilter : 'all',
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [listError, setListError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [invites, setInvites] = useState<OutstandingInvitation[] | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteFlowError, setInviteFlowError] = useState<string | null>(null)
  const [inviteWarning, setInviteWarning] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [resetMember, setResetMember] = useState<{ memberId: string; displayName: string } | null>(null)
  const [rosterByUser, setRosterByUser] = useState<Record<string, string>>({})
  const [managedEnabled, setManagedEnabled] = useState(false)

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
  const { t } = useT()

  const isOwner = isOwnerRole(group?.role)
  const canManage = canManageContentRole(group?.role)

  async function reloadMembers() {
    if (!groupId) return
    setListError(null)
    try {
      setMembers(await listMembers(groupId))
    } catch (err) {
      setMembers([])
      setListError(mutationErrorMessage(err))
    }
  }

  // Live refresh when members change elsewhere (invite, role change, leave).
  useGroupDataSignal('members', groupId, reloadMembers)

  // Managed-account map (Owners only): userId -> roster memberId, so a managed
  // member row can regenerate access. 404 when the feature is off -> empty map.
  useEffect(() => {
    if (!groupId || !managedEnabled || !isOwnerRole(group?.role)) return
    let cancelled = false
    void listRoster(groupId)
      .then((items) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const item of items) {
          if (item.userId && item.hasAccess) map[item.userId] = item.memberId
        }
        setRosterByUser(map)
      })
      .catch(() => {
        if (!cancelled) setRosterByUser({})
      })
    return () => {
      cancelled = true
    }
  }, [groupId, group?.role, managedEnabled])

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
        setListError(mutationErrorMessage(err))
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
        setInviteError(mutationErrorMessage(err))
      }
    }
    void load()
    void loadInvites()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  async function onChangeRole(
    targetUserId: string,
    role: 'Owner' | 'Manager' | 'Member' | 'Viewer',
  ) {
    if (!groupId) return
    setPendingUserId(targetUserId)
    setActionError(null)
    try {
      await changeMemberRole(groupId, targetUserId, role)
      await reloadMembers()
    } catch (err) {
      setActionError(mutationErrorMessage(err))
    } finally {
      setPendingUserId(null)
    }
  }

  async function onSetMusicalRole(targetUserId: string, musicalRole: string) {
    if (!groupId) return
    setPendingUserId(targetUserId)
    setActionError(null)
    try {
      await setMemberMusicalRole(groupId, targetUserId, musicalRole.trim() === '' ? null : musicalRole.trim())
      await reloadMembers()
    } catch (err) {
      setActionError(mutationErrorMessage(err))
    } finally {
      setPendingUserId(null)
    }
  }

  async function onRemove(targetUserId: string) {
    if (!groupId) return
    setPendingUserId(targetUserId)
    setActionError(null)
    try {
      await removeMember(groupId, targetUserId)
      await reloadMembers()
    } catch (err) {
      setActionError(mutationErrorMessage(err))
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
      setInvites(await listInvitations(groupId))
    } catch (err) {
      setInviteError(mutationErrorMessage(err))
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
      setInviteUrl(`${window.location.origin}/join/${created.token}`)
      if (inviteEmail.trim() && !created.emailed) setInviteWarning(true)
      setInvites(await listInvitations(groupId))
    } catch (err) {
      setInviteFlowError(mutationErrorMessage(err))
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
      navigate('/')
    } catch (err) {
      setActionError(mutationErrorMessage(err))
    } finally {
      setLeaving(false)
    }
  }

  if (group === undefined) {
    return <GroupPageSkeleton label={t('people.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} />
        <GroupLink variant="secondary" to="/">
          {t('people.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const visibleMembers = (members ?? []).filter(
    (m) => roleTab === 'all' || roleTabOf(m.role) === roleTab,
  ).filter((m) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      m.displayName.toLowerCase().includes(q) ||
      (m.email ?? '').toLowerCase().includes(q) ||
      (m.musicalRole ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <section className="space-y-6" aria-labelledby="people-heading">
      <GroupPageHeader
        headingId="people-heading"
        icon={Users}
        title={t('people.title')}
        subtitle={t('people.subtitle')}
        breadcrumb={[{ to: `/groups/${group.id}`, label: group.name }, { label: t('people.title') }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? (
            <GroupButton onClick={openInviteDialog} className="whitespace-nowrap">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {t('dashboard.invite')}
            </GroupButton>
          ) : null}
          {isOwner && managedEnabled ? (
            <GroupButton
              variant="secondary"
              className="whitespace-nowrap"
              onClick={() => {
                setResetMember(null)
                setRosterOpen(true)
              }}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {t('roster.addButton')}
            </GroupButton>
          ) : null}
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('people.title')}>
            {([
              { id: 'all', label: t('people.tabAll') },
              { id: 'admins', label: t('people.tabAdmins') },
              { id: 'leaders', label: t('people.tabLeaders') },
              { id: 'members', label: t('people.tabMembers') },
            ] as { id: RoleTab; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={roleTab === tab.id}
                onClick={() => setRoleTab(tab.id)}
                className={cn(
                  'min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  roleTab === tab.id
                    ? 'bg-primary-strong text-primary-foreground'
                    : 'text-muted hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="min-w-48 flex-1">
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
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-h-11"
              maxLength={200}
            />
          </div>
        </div>
      </GroupPageHeader>

      <GroupErrorState message={listError} />
      <GroupErrorState message={actionError} />
      <GroupErrorState message={inviteError} />

      {members === null ? (
        <GroupListSkeleton rows={3} label={t('people.loading')} />
      ) : visibleMembers.length === 0 ? (
        <GroupEmptyState
          icon={Users}
          title={t('people.emptyTitle')}
          description={t('people.emptyBody')}
        />
      ) : (
        <ul className="space-y-2">
          {visibleMembers.map((member, index) => {
            const isSelf = member.userId === user.id
            const busy = pendingUserId === member.userId
            return (
              <li
                key={member.userId}
                className="library-enter"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <GroupCard className="space-y-3">
                  <div className="flex items-center gap-3">
                    <GroupIconWell
                      icon={member.role === 'Owner' ? Users : UserRound}
                      tone={member.role === 'Owner' ? 'accent' : 'neutral'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">
                        {member.displayName}
                        {isSelf ? (
                          <span className="ml-2 text-sm font-normal text-muted">{t('people.you')}</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted">
                        {formatRole(member.role, t)}
                        {member.musicalRole ? ` · ${member.musicalRole}` : ''}
                      </p>
                      {member.email ? (
                        <p className="truncate text-sm text-muted">{member.email}</p>
                      ) : null}
                      <p className="text-xs text-muted">
                        {presenceLabel(member.lastSeenAt, t, Date.now())}
                      </p>
                    </div>
                  </div>
                  {isOwner || canManage ? (
                    <div className="flex flex-wrap items-end gap-3 border-t border-border-subtle pt-3">
                      {isOwner ? (
                        <div className="min-w-48 flex-1">
                          <GroupSelect
                            label={t('people.roleLabel')}
                            aria-label={`${t('people.roleOfPrefix')}${member.displayName}`}
                            value={member.role}
                            disabled={busy}
                            onChange={(next) => {
                              if (
                                next === 'Owner' ||
                                next === 'Manager' ||
                                next === 'Member' ||
                                next === 'Viewer'
                              ) {
                                void onChangeRole(member.userId, next)
                              }
                            }}
                            options={[
                              { value: 'Owner', label: t('people.roleOwner') },
                              { value: 'Manager', label: t('people.roleManager') },
                              { value: 'Member', label: t('people.roleMember') },
                              { value: 'Viewer', label: t('people.roleViewer') },
                            ]}
                          />
                        </div>
                      ) : null}
                      <div className="min-w-48 flex-1">
                        <GroupInput
                          label={t('people.musicalRoleLabel')}
                          type="text"
                          maxLength={64}
                          defaultValue={member.musicalRole ?? ''}
                          placeholder={t('people.musicalRolePlaceholder')}
                          aria-label={`${t('people.musicalRoleOfPrefix')}${member.displayName}`}
                          disabled={busy}
                          onBlur={(event) => {
                            const next = event.target.value
                            if ((member.musicalRole ?? '') !== next) {
                              void onSetMusicalRole(member.userId, next)
                            }
                          }}
                        />
                      </div>
                      {isOwner && !isSelf && rosterByUser[member.userId] ? (
                        <GroupButton
                          variant="secondary"
                          disabled={busy}
                          onClick={() => {
                            setResetMember({
                              memberId: rosterByUser[member.userId]!,
                              displayName: member.displayName,
                            })
                            setRosterOpen(true)
                          }}
                        >
                          {t('roster.reset')}
                        </GroupButton>
                      ) : null}
                      {isOwner && !isSelf ? (
                        <GroupButton
                          variant="danger"
                          disabled={busy}
                          aria-label={`${t('people.removePrefix')}${member.displayName}`}
                          onClick={() => void onRemove(member.userId)}
                        >
                          {t('people.remove')}
                        </GroupButton>
                      ) : null}
                    </div>
                  ) : null}
                </GroupCard>
              </li>
            )
          })}
        </ul>
      )}

      {isOwner ? (
        <GroupSection title={t('people.invitesTitle')} headingId="invites-heading">
          {invites === null ? (
            <GroupListSkeleton rows={2} label={t('people.loadingInvites')} />
          ) : invites.length === 0 ? (
            <GroupEmptyState title={t('people.noInvites')} />
          ) : (
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li key={invite.id}>
                  <GroupCard className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      {t('people.expiresPrefix')}{new Date(invite.expiresAt).toLocaleString('es')}
                    </p>
                    <GroupButton
                      variant="danger"
                      size="sm"
                      disabled={revokingId === invite.id}
                      aria-label={`${t('people.revokePrefix')}${invite.expiresAt}`}
                      onClick={() => void onRevoke(invite.id)}
                    >
                      {t('people.revoke')}
                    </GroupButton>
                  </GroupCard>
                </li>
              ))}
            </ul>
          )}
        </GroupSection>
      ) : null}

      {isOwner ? null : (
        <GroupButton variant="secondary" disabled={leaving} onClick={() => void onLeave()}>
          {leaving ? t('people.leaving') : t('people.leave')}
        </GroupButton>
      )}

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
            <p role="status" className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-ink">
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
    </section>
  )
}
