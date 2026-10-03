import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { EmptyPanel, PageBreadcrumb } from '../repertoire/chrome'
import { useT, type I18nKey, type TParams } from '../i18n'
import {
  canManageContentRole,
  isOwnerRole,
  formatMembershipRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { ListSkeleton, PageSkeleton } from '../ui/skeleton'

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
    return <PageSkeleton label={t('gente.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('gente.myGroups')}
        </Link>
      </div>
    )
  }

  const visibleMembers = (members ?? []).filter(
    (m) => roleTab === 'all' || roleTabOf(m.role) === roleTab,
  )

  return (
    <section className="space-y-6" aria-labelledby="people-heading">
      <div className="space-y-2">
        <PageBreadcrumb
          items={[{ to: `/groups/${group.id}`, label: group.name }, { label: t('gente.title') }]}
        />
        <h1 id="people-heading" className="text-2xl font-bold tracking-tight">
          {t('gente.title')}
        </h1>
        <p className="text-sm text-slate-500">
          {t('gente.subtitle')}
        </p>
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
                'min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                roleTab === tab.id
                  ? 'bg-primary-strong text-primary-foreground'
                  : 'text-muted hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <ProblemAlert message={listError} />
      <ProblemAlert message={actionError} />
      <ProblemAlert message={inviteError} />

      {members === null ? (
        <ListSkeleton rows={3} label={t('gente.loading')} />
      ) : visibleMembers.length === 0 ? (
        <EmptyPanel
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
                className="library-enter space-y-3 rounded-2xl border border-slate-100 bg-white px-4 py-3"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                      member.role === 'Owner'
                        ? 'bg-primary/15 text-primary-ink'
                        : 'bg-neutral-light text-slate-600',
                    )}
                    aria-hidden="true"
                  >
                    {member.role === 'Owner' ? (
                      <Users className="h-5 w-5" />
                    ) : (
                      <UserRound className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-dark">
                      {member.displayName}
                      {isSelf ? (
                        <span className="ml-2 text-sm font-normal text-slate-500">{t('gente.you')}</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatRole(member.role)}
                      {member.musicalRole ? ` · ${member.musicalRole}` : ''}
                    </p>
                    {member.email ? (
                      <p className="truncate text-sm text-slate-500">{member.email}</p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      {presenceLabel(member.lastSeenAt, t, Date.now())}
                    </p>
                  </div>
                </div>
                {isOwner || canManage ? (
                  <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                    {isOwner ? (
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">{t('gente.roleLabel')}</span>
                        <select
                          className={fieldClass}
                          aria-label={`${t('gente.roleOfPrefix')}${member.displayName}`}
                          value={member.role}
                          disabled={busy}
                          onChange={(event) => {
                            const next = event.target.value
                            if (
                              next === 'Owner' ||
                              next === 'Manager' ||
                              next === 'Member' ||
                              next === 'Viewer'
                            ) {
                              void onChangeRole(member.userId, next)
                            }
                          }}
                        >
                          <option value="Owner">{t('gente.roleOwner')}</option>
                          <option value="Manager">{t('gente.roleManager')}</option>
                          <option value="Member">{t('gente.roleMember')}</option>
                          <option value="Viewer">{t('gente.roleViewer')}</option>
                        </select>
                      </label>
                    ) : null}
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">{t('gente.musicalRoleLabel')}</span>
                      <input
                        className={fieldClass}
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
                    </label>
                    {isOwner && !isSelf ? (
                      <Button
                        variant="danger"
                        disabled={busy}
                        aria-label={`${t('gente.removePrefix')}${member.displayName}`}
                        onClick={() => void onRemove(member.userId)}
                      >
                        {t('gente.remove')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {isOwner ? (
        <section className="space-y-3" aria-labelledby="invites-heading">
          <h2 id="invites-heading" className="text-lg font-semibold">
            {t('gente.invitesTitle')}
          </h2>
          {invites === null ? (
            <ListSkeleton rows={2} label={t('gente.loadingInvites')} />
          ) : invites.length === 0 ? (
            <p className="text-sm text-slate-500">{t('gente.noInvites')}</p>
          ) : (
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3"
                >
                  <p className="text-sm text-slate-600">
                    {t('gente.expiresPrefix')}{new Date(invite.expiresAt).toLocaleString('es')}
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={revokingId === invite.id}
                    aria-label={`${t('gente.revokePrefix')}${invite.expiresAt}`}
                    onClick={() => void onRevoke(invite.id)}
                  >
                    {t('gente.revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isOwner ? null : (
        <Button variant="secondary" disabled={leaving} onClick={() => void onLeave()}>
          {leaving ? t('gente.leaving') : t('gente.leave')}
        </Button>
      )}
    </section>
  )
}
