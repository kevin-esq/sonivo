import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserRound, Users } from 'lucide-react'
import {
  changeMemberRole,
  leaveGroup,
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
  useGroupContext,
} from '../repertoire/ui'
import { cn } from '../ui/cn'
import {
  GroupButton,
  GroupCard,
  GroupEmptyState,
  GroupErrorState,
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

function formatRole(role: string): string {
  return formatMembershipRole(role)
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
  if (!lastSeenAt) return t('gente.neverSeen')
  const diffMs = now - new Date(lastSeenAt).getTime()
  if (Number.isNaN(diffMs) || diffMs < 5 * 60 * 1000) return t('gente.online')
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 24) return t('gente.lastSeenHours', { count: hours })
  return t('gente.lastSeenDays', { count: Math.floor(hours / 24) })
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
    return <GroupPageSkeleton label={t('gente.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} />
        <GroupLink variant="secondary" to="/">
          {t('gente.myGroups')}
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
        title={t('gente.title')}
        subtitle={t('gente.subtitle')}
        breadcrumb={[{ to: `/groups/${group.id}`, label: group.name }, { label: t('gente.title') }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('gente.title')}>
            {([
              { id: 'all', label: t('gente.tabAll') },
              { id: 'admins', label: t('gente.tabAdmins') },
              { id: 'leaders', label: t('gente.tabLeaders') },
              { id: 'members', label: t('gente.tabMembers') },
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
              {t('gente.searchLabel')}
            </label>
            <GroupInput
              id="people-search"
              type="search"
              data-testid="people-search"
              aria-label={t('gente.searchLabel')}
              placeholder={t('gente.searchPlaceholder')}
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
        <GroupListSkeleton rows={3} label={t('gente.loading')} />
      ) : visibleMembers.length === 0 ? (
        <GroupEmptyState
          icon={Users}
          title={t('gente.emptyTitle')}
          description={t('gente.emptyBody')}
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
                          <span className="ml-2 text-sm font-normal text-muted">{t('gente.you')}</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted">
                        {formatRole(member.role)}
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
                            label={t('gente.roleLabel')}
                            aria-label={`${t('gente.roleOfPrefix')}${member.displayName}`}
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
                              { value: 'Owner', label: t('gente.roleOwner') },
                              { value: 'Manager', label: t('gente.roleManager') },
                              { value: 'Member', label: t('gente.roleMember') },
                              { value: 'Viewer', label: t('gente.roleViewer') },
                            ]}
                          />
                        </div>
                      ) : null}
                      <div className="min-w-48 flex-1">
                        <GroupInput
                          label={t('gente.musicalRoleLabel')}
                          type="text"
                          maxLength={64}
                          defaultValue={member.musicalRole ?? ''}
                          placeholder={t('gente.musicalRolePlaceholder')}
                          aria-label={`${t('gente.musicalRoleOfPrefix')}${member.displayName}`}
                          disabled={busy}
                          onBlur={(event) => {
                            const next = event.target.value
                            if ((member.musicalRole ?? '') !== next) {
                              void onSetMusicalRole(member.userId, next)
                            }
                          }}
                        />
                      </div>
                      {isOwner && !isSelf ? (
                        <GroupButton
                          variant="danger"
                          disabled={busy}
                          aria-label={`${t('gente.removePrefix')}${member.displayName}`}
                          onClick={() => void onRemove(member.userId)}
                        >
                          {t('gente.remove')}
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
        <GroupSection title={t('gente.invitesTitle')} headingId="invites-heading">
          {invites === null ? (
            <GroupListSkeleton rows={2} label={t('gente.loadingInvites')} />
          ) : invites.length === 0 ? (
            <GroupEmptyState title={t('gente.noInvites')} />
          ) : (
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li key={invite.id}>
                  <GroupCard className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      {t('gente.expiresPrefix')}{new Date(invite.expiresAt).toLocaleString('es')}
                    </p>
                    <GroupButton
                      variant="danger"
                      size="sm"
                      disabled={revokingId === invite.id}
                      aria-label={`${t('gente.revokePrefix')}${invite.expiresAt}`}
                      onClick={() => void onRevoke(invite.id)}
                    >
                      {t('gente.revoke')}
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
          {leaving ? t('gente.leaving') : t('gente.leave')}
        </GroupButton>
      )}
    </section>
  )
}
