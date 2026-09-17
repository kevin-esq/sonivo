import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  createInvitation,
  deleteGroup,
  getGroup,
  problemDetail,
  updateGroup,
  type CurrentUser,
  type GroupDetail,
} from '../api/client'
import {
  ConfirmDialog,
  CONFLICT_MESSAGE,
  ConflictAlert,
  fieldClass,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
} from '../repertoire/ui'
import { Button } from '../ui/button'

export function GroupHomePage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteEmailWarning, setInviteEmailWarning] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameConflict, setRenameConflict] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      setInviteUrl(null)
      setInviteError(null)
      setInviteEmail('')
      setInviteEmailWarning(null)
      setCopied(false)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) {
          setGroup(result)
          setRenameName(result.name)
        }
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        if (err instanceof ApiError && err.status === 404) {
          setError('Group not found or you do not have access.')
        } else {
          setError(problemDetail(err))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, user.id])

  const isOwner = isOwnerRole(group?.role)

  async function onInviteMember() {
    if (!group) return
    setInviting(true)
    setInviteError(null)
    setInviteEmailWarning(null)
    setCopied(false)
    try {
      const created = await createInvitation(group.id, inviteEmail)
      setInviteUrl(`${window.location.origin}/join/${created.token}`)
      if (inviteEmail.trim() && !created.emailed) {
        setInviteEmailWarning(
          'Invite created, but the email was not sent. Copy the link and share it yourself.',
        )
      }
    } catch (err) {
      setInviteError(mutationErrorMessage(err))
    } finally {
      setInviting(false)
    }
  }

  async function onRename(event: FormEvent) {
    event.preventDefault()
    if (!group) return
    setRenaming(true)
    setRenameError(null)
    setRenameConflict(null)
    try {
      const updated = await updateGroup(group.id, {
        name: renameName,
        expectedVersion: group.version,
      })
      setGroup(updated)
      setRenameName(updated.name)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRenameConflict(CONFLICT_MESSAGE)
        try {
          const latest = await getGroup(group.id)
          setGroup(latest)
          setRenameName(latest.name)
        } catch (reloadErr) {
          setRenameError(mutationErrorMessage(reloadErr))
        }
      } else {
        setRenameError(mutationErrorMessage(err))
      }
    } finally {
      setRenaming(false)
    }
  }

  async function onConfirmDelete() {
    if (!group) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteGroup(group.id, group.version)
      setDeleteOpen(false)
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(CONFLICT_MESSAGE)
        try {
          const latest = await getGroup(group.id)
          setGroup(latest)
          setRenameName(latest.name)
        } catch (reloadErr) {
          setDeleteError(mutationErrorMessage(reloadErr))
        }
      } else {
        setDeleteError(mutationErrorMessage(err))
      }
    } finally {
      setDeleting(false)
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

  if (group === undefined) {
    return <p aria-live="polite">Cargando grupo…</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-error">
          {error}
        </p>
        <Link className="font-semibold text-primary no-underline hover:underline" to="/">
          Mis grupos
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="group-heading">
      <div>
        <h1 id="group-heading" className="text-2xl font-bold tracking-tight">
          {group.name}
        </h1>
        <p className="mt-1 text-slate-600">
          Rol: <strong>{group.role}</strong>. Versión: <strong>{group.version}</strong>.
        </p>
      </div>
      {isOwner ? (
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="block max-w-md space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Invitee email (optional)</span>
              <input
                className={fieldClass}
                type="email"
                autoComplete="off"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <Button disabled={inviting} onClick={() => void onInviteMember()}>
              {inviting ? 'Working…' : 'Invite member'}
            </Button>
            <ProblemAlert message={inviteError} />
            {inviteEmailWarning ? (
              <p role="status" className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-neutral-dark">
                {inviteEmailWarning}
              </p>
            ) : null}
            {inviteUrl ? (
              <div className="max-w-md space-y-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Invite link</span>
                  <input className={fieldClass} readOnly value={inviteUrl} />
                </label>
                <Button variant="secondary" onClick={() => void onCopyInviteLink()}>
                  Copy invite link
                </Button>
                {copied ? (
                  <p aria-live="polite" className="text-sm text-slate-600">
                    Copied
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <form className="max-w-md space-y-3 border-t border-slate-200 pt-6" onSubmit={onRename}>
            <h2 className="font-semibold">Rename group</h2>
            <ConflictAlert message={renameConflict} />
            <ProblemAlert message={renameError} />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Name</span>
              <input
                className={fieldClass}
                required
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                maxLength={200}
              />
            </label>
            <Button variant="secondary" type="submit" disabled={renaming}>
              {renaming ? 'Working…' : 'Save name'}
            </Button>
          </form>
          <div className="space-y-3 border-t border-slate-200 pt-6">
            <h2 className="font-semibold">Delete group</h2>
            <ProblemAlert message={deleteError} />
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete group
            </Button>
            <ConfirmDialog
              open={deleteOpen}
              title="Delete group?"
              confirmLabel="Delete group"
              pending={deleting}
              onConfirm={() => void onConfirmDelete()}
              onCancel={() => {
                if (!deleting) setDeleteOpen(false)
              }}
            >
              <p>This hides the group for everyone in it. You cannot undo from this screen.</p>
            </ConfirmDialog>
          </div>
        </div>
      ) : null}
    </section>
  )
}
