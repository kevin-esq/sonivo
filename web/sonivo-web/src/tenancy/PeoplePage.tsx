import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  changeMemberRole,
  leaveGroup,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
  type CurrentUser,
  type MemberListItem,
  type OutstandingInvitation,
} from '../api/client'
import {
  dangerButtonClass,
  fieldClass,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
  secondaryButtonClass,
  useGroupContext,
} from '../repertoire/ui'
import { GroupSectionNav } from '../scheduling/GroupSectionNav'

export function PeoplePage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [invites, setInvites] = useState<OutstandingInvitation[] | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const isOwner = isOwnerRole(group?.role)

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
    void load()
    async function loadInvites() {
      if (!isOwnerRole(group.role)) {
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
    void loadInvites()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  async function onChangeRole(targetUserId: string, role: 'Owner' | 'Member') {
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
    return <p aria-live="polite">Loading people…</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="underline" to="/">
          Back to my groups
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="people-heading">
      <h2 id="people-heading" className="text-xl font-medium">
        People
      </h2>
      <p className="text-slate-700">{group.name}</p>
      <GroupSectionNav groupId={group.id} />
      <ProblemAlert message={listError} />
      <ProblemAlert message={actionError} />
      <ProblemAlert message={inviteError} />

      {members === null ? (
        <p aria-live="polite">Loading members…</p>
      ) : members.length === 0 ? (
        <p>No members.</p>
      ) : (
        <ul className="space-y-3">
          {members.map((member) => {
            const isSelf = member.userId === user.id
            const busy = pendingUserId === member.userId
            return (
              <li key={member.userId} className="space-y-2 border border-slate-300 p-3">
                <p>
                  <span className="font-medium">{member.displayName}</span>
                  <span className="ml-2 text-sm text-slate-600">({member.role})</span>
                  {isSelf ? <span className="ml-2 text-sm text-slate-500">you</span> : null}
                </p>
                {isOwner ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block space-y-1">
                      <span className="text-sm text-slate-700">Role</span>
                      <select
                        className={fieldClass}
                        aria-label={`Role for ${member.displayName}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) => {
                          const next = event.target.value
                          if (next === 'Owner' || next === 'Member') {
                            void onChangeRole(member.userId, next)
                          }
                        }}
                      >
                        <option value="Owner">Owner</option>
                        <option value="Member">Member</option>
                      </select>
                    </label>
                    {isSelf ? null : (
                      <button
                        type="button"
                        className={dangerButtonClass}
                        disabled={busy}
                        aria-label={`Remove ${member.displayName}`}
                        onClick={() => void onRemove(member.userId)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {isOwner ? (
        <section className="space-y-3" aria-labelledby="invites-heading">
          <h3 id="invites-heading" className="font-medium">
            Outstanding invites
          </h3>
          {invites === null ? (
            <p aria-live="polite">Loading invites…</p>
          ) : invites.length === 0 ? (
            <p>No outstanding invites.</p>
          ) : (
            <ul className="space-y-3">
              {invites.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center gap-3 border border-slate-300 p-3">
                  <p className="text-sm text-slate-700">
                    Expires {new Date(invite.expiresAt).toLocaleString()}
                  </p>
                  <button
                    type="button"
                    className={dangerButtonClass}
                    disabled={revokingId === invite.id}
                    aria-label={`Revoke invite expiring ${invite.expiresAt}`}
                    onClick={() => void onRevoke(invite.id)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isOwner ? null : (
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={leaving}
          onClick={() => void onLeave()}
        >
          {leaving ? 'Working…' : 'Leave group'}
        </button>
      )}
    </section>
  )
}
