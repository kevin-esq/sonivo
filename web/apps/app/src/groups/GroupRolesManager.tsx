import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { FormEvent } from 'react'
import {
  createGroupRole,
  deleteGroupRole,
  listGroupRoles,
  updateGroupRole,
  type GroupRole,
} from '../api/client'
import { useT, type I18nKey } from '../i18n'
import { mutationErrorMessage } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { GroupButton, GroupCard, GroupDialog, GroupEmptyState, GroupErrorState, GroupInput, GroupListSkeleton, GroupSelect } from './ui'

/** Permissions an Owner may grant through a custom role (the rest come from the base role). */
const GRANTABLE = [
  'manage_songs',
  'manage_setlists',
  'manage_events',
  'manage_tasks',
  'respond_rsvp',
  'practice',
] as const

const GRANTABLE_LABELS: Record<string, I18nKey> = {
  manage_songs: 'rolePermission.manageSongs',
  manage_setlists: 'rolePermission.manageSetlists',
  manage_events: 'rolePermission.manageEvents',
  manage_tasks: 'rolePermission.manageTasks',
  respond_rsvp: 'rolePermission.respondRsvp',
  practice: 'rolePermission.practice',
}

function parsePermissions(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Custom roles for a group (ADR-0078): a role is a name plus a permission set
 * that is applied ON TOP of the member's base role (Owner/Manager/Member/Viewer),
 * so defining a role can only widen access.
 */
export function GroupRolesManager({ groupId }: { groupId: string }) {
  const { t } = useT()
  const [roles, setRoles] = useState<GroupRole[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [editing, setEditing] = useState<GroupRole | 'new' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    void listGroupRoles(groupId)
      .then((items) => {
        if (!cancelled) setRoles(items)
      })
      .catch((err) => {
        if (!cancelled) {
          setRoles([])
          setError(mutationErrorMessage(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  const customRoles = useMemo(() => (roles ?? []).filter((role) => !role.isSystem), [roles])

  function openNew() {
    setName('')
    setDescription('')
    setSelected(['manage_songs'])
    setDialogError(null)
    setEditing('new')
  }

  function openEdit(role: GroupRole) {
    setName(role.name)
    setDescription(role.description ?? '')
    setSelected(parsePermissions(role.permissions).filter((p) => GRANTABLE.includes(p as (typeof GRANTABLE)[number])))
    setDialogError(null)
    setEditing(role)
  }

  function toggle(permission: string) {
    setSelected((current) =>
      current.includes(permission) ? current.filter((p) => p !== permission) : [...current, permission],
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setDialogError(null)
    try {
      if (editing === 'new') {
        const created = await createGroupRole(groupId, {
          name: name.trim(),
          description: description.trim() || null,
          permissions: selected,
        })
        setRoles((current) => [...(current ?? []), created])
      } else if (editing) {
        const updated = await updateGroupRole(groupId, editing.id, {
          name: name.trim(),
          description: description.trim() || null,
          permissions: selected,
        })
        setRoles((current) => (current ?? []).map((role) => (role.id === updated.id ? updated : role)))
      }
      setEditing(null)
    } catch (err) {
      setDialogError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function onDelete(role: GroupRole) {
    setDialogError(null)
    try {
      await deleteGroupRole(groupId, role.id)
      setRoles((current) => (current ?? []).filter((item) => item.id !== role.id))
    } catch (err) {
      setError(mutationErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <ShieldCheck className="h-5 w-5 text-primary-ink" aria-hidden="true" />
            {t('groupRole.title')}
          </h2>
          <p className="text-sm text-muted">{t('groupRole.subtitle')}</p>
        </div>
        <GroupButton type="button" onClick={openNew}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('groupRole.new')}
        </GroupButton>
      </div>

      <GroupErrorState message={error} />

      {roles === null ? (
        <GroupListSkeleton rows={3} label={t('audit.loading')} />
      ) : customRoles.length === 0 ? (
        <GroupEmptyState icon={ShieldCheck} title={t('groupRole.emptyTitle')} description={t('groupRole.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="group-roles-list">
          {customRoles.map((role) => (
            <li key={role.id}>
              <GroupCard className="flex flex-wrap items-start justify-between gap-3" padding="sm">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{role.name}</p>
                  {role.description ? <p className="text-sm text-muted">{role.description}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {parsePermissions(role.permissions).length === 0 ? (
                      <span className="text-xs text-muted">{t('groupRole.noPermissions')}</span>
                    ) : (
                      parsePermissions(role.permissions).map((permission) => (
                        <span
                          key={permission}
                          className="rounded-full border border-primary/30 bg-primary/12 px-2.5 py-0.5 text-xs font-medium text-primary-ink"
                        >
                          {GRANTABLE_LABELS[permission] ? t(GRANTABLE_LABELS[permission]!) : permission}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <GroupButton variant="secondary" size="sm" onClick={() => openEdit(role)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {t('groupRole.edit')}
                  </GroupButton>
                  <GroupButton variant="danger" size="sm" onClick={() => void onDelete(role)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {t('groupRole.delete')}
                  </GroupButton>
                </div>
              </GroupCard>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <GroupDialog
          open
          onClose={() => setEditing(null)}
          title={editing === 'new' ? t('groupRole.newTitle') : t('groupRole.editTitle')}
          description={t('groupRole.dialogHint')}
          pending={pending}
          testId="group-role-dialog"
          onSubmit={(event) => void onSubmit(event)}
          footer={
            <>
              <GroupButton variant="secondary" type="button" onClick={() => setEditing(null)} disabled={pending}>
                {t('groupRole.cancel')}
              </GroupButton>
              <GroupButton type="submit" disabled={pending || name.trim().length < 2}>
                {pending ? t('groupRole.saving') : editing === 'new' ? t('groupRole.create') : t('groupRole.save')}
              </GroupButton>
            </>
          }
        >
          {dialogError ? (
            <p role="alert" className="text-sm text-error-ink">
              {dialogError}
            </p>
          ) : null}
          <GroupInput
            label={t('groupRole.name')}
            value={name}
            maxLength={60}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
            data-autofocus
          />
          <GroupInput
            label={t('groupRole.description')}
            value={description}
            maxLength={200}
            disabled={pending}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="space-y-2">
            <span className="block text-sm font-medium text-ink">{t('groupRole.permissions')}</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {GRANTABLE.map((permission) => {
                const active = selected.includes(permission)
                return (
                  <label
                    key={permission}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                      active ? 'border-primary/30 bg-primary/10 text-ink' : 'border-border-subtle text-muted',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-primary)]"
                      checked={active}
                      disabled={pending}
                      onChange={() => toggle(permission)}
                    />
                    {t(GRANTABLE_LABELS[permission]!)}
                  </label>
                )
              })}
            </div>
          </div>
        </GroupDialog>
      ) : null}
    </div>
  )
}

/** Select for assigning a custom group role to a member. */
export function GroupRoleSelect({
  groupId,
  roles,
  value,
  disabled,
  onChange,
}: {
  groupId: string
  roles: GroupRole[] | null
  value: string | null
  disabled?: boolean
  onChange: (roleId: string | null) => void
}) {
  const { t } = useT()
  const options = [
    { value: '', label: t('groupRole.noRole') },
    ...(roles ?? [])
      .filter((role) => !role.isSystem)
      .map((role) => ({ value: role.id, label: role.name })),
  ]
  if (options.length === 1) return null
  return (
    <GroupSelect
      label={t('groupRole.assign')}
      value={value ?? ''}
      disabled={disabled}
      options={options}
      onChange={(next) => onChange(next === '' ? null : next)}
    />
  )
}
