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
  type CurrentUser,
  type MemberListItem,
  type OutstandingInvitation,
} from '../api/client'
import { EmptyPanel, PageBreadcrumb } from '../repertoire/chrome'
import {
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
    return <PageSkeleton label="Cargando miembros…" />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary no-underline hover:underline" to="/">
          Mis grupos
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="people-heading">
      <div className="space-y-2">
        <PageBreadcrumb
          items={[{ to: `/groups/${group.id}`, label: group.name }, { label: 'Miembros' }]}
        />
        <h1 id="people-heading" className="text-2xl font-bold tracking-tight">
          Miembros
        </h1>
        <p className="text-sm text-slate-500">
          Quién forma el grupo, roles y invitaciones pendientes.
        </p>
      </div>

      <ProblemAlert message={listError} />
      <ProblemAlert message={actionError} />
      <ProblemAlert message={inviteError} />

      {members === null ? (
        <ListSkeleton rows={3} label="Cargando miembros…" />
      ) : members.length === 0 ? (
        <EmptyPanel
          title="No hay miembros"
          description="Cuando haya personas en el grupo, aparecerán aquí."
        />
      ) : (
        <ul className="space-y-2">
          {members.map((member, index) => {
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
                        ? 'bg-primary/15 text-primary'
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
                        <span className="ml-2 text-sm font-normal text-slate-500">(tú)</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-500">({formatRole(member.role)})</p>
                  </div>
                </div>
                {isOwner ? (
                  <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Rol</span>
                      <select
                        className={fieldClass}
                        aria-label={`Rol de ${member.displayName}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) => {
                          const next = event.target.value
                          if (next === 'Owner' || next === 'Member') {
                            void onChangeRole(member.userId, next)
                          }
                        }}
                      >
                        <option value="Owner">Organizador</option>
                        <option value="Member">Miembro</option>
                      </select>
                    </label>
                    {isSelf ? null : (
                      <Button
                        variant="danger"
                        disabled={busy}
                        aria-label={`Eliminar ${member.displayName}`}
                        onClick={() => void onRemove(member.userId)}
                      >
                        Eliminar
                      </Button>
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
          <h2 id="invites-heading" className="text-lg font-semibold">
            Invitaciones pendientes
          </h2>
          {invites === null ? (
            <ListSkeleton rows={2} label="Cargando invitaciones…" />
          ) : invites.length === 0 ? (
            <p className="text-sm text-slate-500">No hay invitaciones pendientes.</p>
          ) : (
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3"
                >
                  <p className="text-sm text-slate-600">
                    Caduca {new Date(invite.expiresAt).toLocaleString('es')}
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={revokingId === invite.id}
                    aria-label={`Revocar invitación que caduca ${invite.expiresAt}`}
                    onClick={() => void onRevoke(invite.id)}
                  >
                    Revocar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isOwner ? null : (
        <Button variant="secondary" disabled={leaving} onClick={() => void onLeave()}>
          {leaving ? 'Trabajando…' : 'Salir del grupo'}
        </Button>
      )}
    </section>
  )
}
