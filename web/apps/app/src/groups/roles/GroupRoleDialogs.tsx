import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronDown, EyeOff, Trash2 } from 'lucide-react'
import {
  createGroupRole,
  deleteGroupRole,
  setMemberGroupRole,
  updateGroupRole,
  type GroupRole,
} from '../../api/client'
import type { MemberListItem } from '../../api/client'
import { useT } from '../../i18n'
import { mutationErrorMessage, formatMembershipRole } from '../../repertoire/ui'
import { GroupButton, GroupDialog, GroupInput, GroupSelect, GroupTextArea } from '../ui'
import { cn } from '../../ui/cn'
import {
  ASSIGNABLE_KEYS,
  ASSIGNABLE_PERMISSIONS,
  BASE_ROLES,
  BASE_ROLE_LABEL,
  PERMISSION_CATEGORIES,
  type BaseRole,
} from './permissionCatalog'
import {
  baseRolePermissions,
  includePermissionDependencies,
  parsePermissions,
  removePermissionAndDependents,
} from './permissionResolution'

/**
 * The role-management dialogs (ADR-0080): create, edit information,
 * duplicate, delete and bulk member assignment. Every mutation goes through the
 * server; the dialogs only collect input and surface the server's answer.
 */

function DialogError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-error-ink">
      {message}
    </p>
  )
}

/**
 * Collapsible permission group used by the create dialog: every row is a real
 * checkbox, so an Owner can grant one capability without granting its siblings.
 * Owner-only capabilities are never listed here — the server refuses them and
 * showing them would imply they were grantable.
 */
function PermissionGroup({
  category,
  selected,
  disabled,
  onToggle,
}: {
  category: (typeof PERMISSION_CATEGORIES)[number]
  selected: string[]
  disabled?: boolean
  onToggle: (permission: string) => void
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const Icon = category.icon
  const grantable = category.permissions.filter((permission) => permission.assignable)
  if (grantable.length === 0) return null
  const count = grantable.filter((permission) => selected.includes(permission.key)).length

  return (
    <section className="rounded-xl border border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover/60"
      >
        <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold text-ink">{t(category.labelKey)}</span>
        <span className="text-xs text-muted">
          {count} / {grantable.length}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted transition-transform', open ? '' : '-rotate-90')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="divide-y divide-border-subtle border-t border-border-subtle">
          {grantable.map((permission) => (
            <label
              key={permission.key}
              className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-hover/40"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                checked={selected.includes(permission.key)}
                disabled={disabled}
                onChange={() => onToggle(permission.key)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">
                  {t(permission.labelKey)}
                </span>
                <span className="block text-xs text-muted">
                  {t(permission.descriptionKey)}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ create */

/**
 * Create dialog (ADR-0080).
 *
 * A role may start from a base role's permission set (copy) or from nothing,
 * and either way the Owner can then toggle ANY assignable permission
 * individually. The previous "copy a base role, nothing else" behaviour made the
 * granular catalogue useless here: you could only re-create what a base role
 * already had. Starting from a base role is now a convenience, not a limit.
 */
export function CreateRoleDialog({
  open,
  onClose,
  groupId,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  onCreated: (role: GroupRole) => void
}) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [base, setBase] = useState<string>('Member')
  const [selected, setSelected] = useState<string[]>(() =>
    includePermissionDependencies([...baseRolePermissions('Member')]),
  )
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setBase('Member')
    setSelected(
      includePermissionDependencies([...baseRolePermissions('Member')]),
    )
    setPermissionsOpen(false)
    setError(null)
  }, [open])

  const baseOptions = [
    { value: '', label: t('roles.baseNone') },
    ...BASE_ROLES.filter((role) => role !== 'Owner').map((role) => ({
      value: role,
      label: t(BASE_ROLE_LABEL[role]),
    })),
  ]

  function applyBase(next: string) {
    setBase(next)
    if (!next) {
      setSelected([])
      return
    }
    // Seed from the base role, but only with what a custom role may hold.
    setSelected(includePermissionDependencies([...baseRolePermissions(next)]))
  }

  function toggle(permission: string) {
    setSelected((current) =>
      current.includes(permission)
        ? removePermissionAndDependents(current, permission)
        : includePermissionDependencies([...current, permission]),
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const created = await createGroupRole(groupId, {
        name: name.trim(),
        description: description.trim() || null,
        // Send exactly what the Owner checked; the server re-validates every key
        // and refuses anything a custom role may not hold.
        permissions: selected,
      })
      onCreated(created)
      onClose()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  const granted = selected.length

  return (
    <GroupDialog
      open={open}
      onClose={onClose}
      title={t('roles.createTitle')}
      description={t('roles.createHint')}
      pending={pending}
      testId="role-create-dialog"
      onSubmit={(event) => void onSubmit(event)}
      footer={
        <>
          <GroupButton variant="secondary" type="button" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </GroupButton>
          <GroupButton type="submit" disabled={pending || name.trim().length < 2}>
            {pending ? t('roles.createPending') : t('roles.create')}
          </GroupButton>
        </>
      }
    >
      <DialogError message={error} />
      <GroupInput
        label={t('roles.nameLabel')}
        placeholder={t('roles.namePlaceholder')}
        hint={name.trim().length < 2 ? t('roles.nameMinLengthHint') : undefined}
        value={name}
        maxLength={60}
        disabled={pending}
        onChange={(event) => setName(event.target.value)}
        data-autofocus
      />
      <GroupTextArea
        label={t('roles.descriptionLabel')}
        placeholder={t('roles.descriptionPlaceholder')}
        value={description}
        maxLength={200}
        rows={2}
        disabled={pending}
        onChange={(event) => setDescription(event.target.value)}
      />
      <GroupSelect
        label={t('roles.baseLabel')}
        hint={base ? t('roles.baseSeedHint') : t('roles.baseNoneHint')}
        value={base}
        disabled={pending}
        options={baseOptions}
        onChange={applyBase}
      />

      <section className="rounded-2xl border border-border-subtle">
        <button
          type="button"
          aria-expanded={permissionsOpen}
          aria-controls="role-create-permissions"
          onClick={() => setPermissionsOpen((current) => !current)}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-surface-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">
              {t('roles.customizePermissions')}
            </span>
            <span className="block text-xs text-muted">
              {t('roles.customizePermissionsHint', {
                selected: granted,
                total: ASSIGNABLE_PERMISSIONS.length,
              })}
            </span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted transition-transform motion-reduce:transition-none', permissionsOpen ? '' : '-rotate-90')}
            aria-hidden="true"
          />
        </button>
        <fieldset
          id="role-create-permissions"
          hidden={!permissionsOpen}
          className="space-y-2 border-t border-border-subtle p-3"
        >
            <legend className="sr-only">{t('roles.permissionsTitle')}</legend>
            {PERMISSION_CATEGORIES.map((category) => (
              <PermissionGroup
                key={category.id}
                category={category}
                selected={selected}
                disabled={pending}
                onToggle={toggle}
              />
            ))}
        </fieldset>
      </section>
    </GroupDialog>
  )
}

/* ------------------------------------------------------------- edit info */

export function EditRoleInfoDialog({
  open,
  onClose,
  groupId,
  role,
  onUpdated,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  role: GroupRole | null
  onUpdated: (role: GroupRole) => void
}) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locked = role?.isSystem ?? false

  useEffect(() => {
    if (!open || !role) return
    setName(role.name)
    setDescription(role.description ?? '')
    setError(null)
  }, [open, role])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!role) return
    setPending(true)
    setError(null)
    try {
      const updated = await updateGroupRole(groupId, role.id, {
        name: name.trim(),
        description: description.trim() || null,
      })
      onUpdated(updated)
      onClose()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open={open}
      onClose={onClose}
      title={t('roles.editInfoTitle')}
      pending={pending}
      testId="role-edit-dialog"
      onSubmit={(event) => void onSubmit(event)}
      footer={
        <>
          <GroupButton variant="secondary" type="button" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </GroupButton>
          <GroupButton type="submit" disabled={pending || locked || name.trim().length < 2}>
            {pending ? t('roles.savePending') : t('groupRole.save')}
          </GroupButton>
        </>
      }
    >
      <DialogError message={error} />
      {locked ? (
        <p className="rounded-xl border border-border-subtle bg-surface-hover px-3 py-2 text-sm text-muted">
          {t('roles.systemLocked')}
        </p>
      ) : null}
      <GroupInput
        label={t('roles.nameLabel')}
        value={name}
        maxLength={60}
        disabled={pending || locked}
        onChange={(event) => setName(event.target.value)}
        data-autofocus
      />
      <GroupTextArea
        label={t('roles.descriptionLabel')}
        value={description}
        maxLength={200}
        rows={3}
        disabled={pending || locked}
        onChange={(event) => setDescription(event.target.value)}
      />
    </GroupDialog>
  )
}

/* -------------------------------------------------------------- duplicate */

export function DuplicateRoleDialog({
  open,
  onClose,
  groupId,
  role,
  onDuplicated,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  role: GroupRole | null
  onDuplicated: (role: GroupRole) => void
}) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !role) return
    setName(`${role.name} (2)`)
    setError(null)
  }, [open, role])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!role) return
    setPending(true)
    setError(null)
    try {
      const created = await createGroupRole(groupId, {
        name: name.trim(),
        description: role.description,
        // Only the assignable permissions are a valid custom-role payload: the
        // server refuses the administrative ones, so never forward them.
        permissions: parsePermissions(role.permissions).filter((key) =>
          ASSIGNABLE_KEYS.includes(key),
        ),
        extendsBaseRole: role.extendsBaseRole,
      })
      onDuplicated(created)
      onClose()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open={open}
      onClose={onClose}
      title={t('roles.duplicateTitle')}
      description={role ? t('roles.duplicateHint', { name: role.name }) : undefined}
      pending={pending}
      testId="role-duplicate-dialog"
      onSubmit={(event) => void onSubmit(event)}
      footer={
        <>
          <GroupButton variant="secondary" type="button" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </GroupButton>
          <GroupButton type="submit" disabled={pending || name.trim().length < 2}>
            {pending ? t('roles.duplicatePending') : t('roles.duplicateRole')}
          </GroupButton>
        </>
      }
    >
      <DialogError message={error} />
      <GroupInput
        label={t('roles.duplicateNameLabel')}
        value={name}
        maxLength={60}
        disabled={pending}
        onChange={(event) => setName(event.target.value)}
        data-autofocus
      />
    </GroupDialog>
  )
}

/* ----------------------------------------------------------------- delete */

export function DeleteRoleDialog({
  open,
  onClose,
  groupId,
  role,
  memberCount,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  role: GroupRole | null
  memberCount: number
  onDeleted: (roleId: string) => void
}) {
  const { t } = useT()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
  }, [open])

  async function onConfirm() {
    if (!role) return
    setPending(true)
    setError(null)
    try {
      await deleteGroupRole(groupId, role.id)
      onDeleted(role.id)
      onClose()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open={open}
      onClose={onClose}
      title={t('roles.deleteTitle')}
      pending={pending}
      testId="role-delete-dialog"
      footer={
        <>
          <GroupButton variant="secondary" type="button" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </GroupButton>
          <GroupButton
            variant="danger"
            type="button"
            onClick={() => void onConfirm()}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {pending ? t('roles.deletePending') : t('roles.deleteRole')}
          </GroupButton>
        </>
      }
    >
      <DialogError message={error} />
      <p className="text-sm text-ink">
        {role
          ? memberCount > 0
            ? t('roles.deleteBodyAssigned', { name: role.name, count: memberCount })
            : t('roles.deleteBody', { name: role.name })
          : null}
      </p>
      {memberCount > 0 ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-ink">
          {t('roles.deleteFooter')}
        </p>
      ) : null}
    </GroupDialog>
  )
}

/* --------------------------------------------------------- manage members */

export function ManageMembersDialog({
  open,
  onClose,
  groupId,
  roles,
  members,
  onSaved,
  onManageResourceAccess,
}: {
  open: boolean
  onClose: () => void
  groupId: string
  roles: GroupRole[]
  members: MemberListItem[]
  onSaved: () => void
  onManageResourceAccess: (member: MemberListItem) => void
}) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setDraft({})
    setError(null)
  }, [open])

  const customRoles = useMemo(() => roles.filter((role) => !role.isSystem), [roles])

  const roleOptions = [
    { value: '', label: t('groupRole.noRole') },
    ...customRoles.map((role) => ({ value: role.id, label: role.name })),
  ]

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName))
    if (!needle) return list
    return list.filter((member) => member.displayName.toLowerCase().includes(needle))
  }, [members, query])

  const pendingCount = Object.keys(draft).length

  function currentRoleId(member: MemberListItem): string {
    return draft[member.userId] ?? member.groupRoleId ?? ''
  }

  function setRole(member: MemberListItem, roleId: string) {
    setDraft((current) => {
      const next = { ...current }
      if (roleId === (member.groupRoleId ?? '')) delete next[member.userId]
      else next[member.userId] = roleId
      return next
    })
  }

  async function onSave() {
    setPending(true)
    setError(null)
    const savedUserIds: string[] = []
    try {
      for (const [userId, roleId] of Object.entries(draft)) {
        await setMemberGroupRole(groupId, userId, roleId === '' ? null : roleId)
        savedUserIds.push(userId)
      }
      onSaved()
      onClose()
    } catch (err) {
      const message = mutationErrorMessage(err, t)
      if (savedUserIds.length > 0) {
        const saved = new Set(savedUserIds)
        setDraft((current) =>
          Object.fromEntries(Object.entries(current).filter(([userId]) => !saved.has(userId))),
        )
        onSaved()
        setError(t('roles.membersPartialSaveError', { count: savedUserIds.length, error: message }))
      } else {
        setError(message)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open={open}
      onClose={onClose}
      title={t('roles.membersTitle')}
      description={t('roles.membersHint')}
      size="lg"
      pending={pending}
      testId="role-members-dialog"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted">
            {pendingCount > 0 ? t('roles.membersPendingCount', { count: pendingCount }) : null}
          </span>
          <GroupButton variant="secondary" type="button" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </GroupButton>
          <GroupButton
            type="button"
            onClick={() => void onSave()}
            disabled={pending || pendingCount === 0}
          >
            {pending ? t('roles.membersSavePending') : t('roles.membersSave')}
          </GroupButton>
        </>
      }
    >
      <DialogError message={error} />
      <GroupInput
        label={t('roles.membersSearch')}
        type="search"
        value={query}
        disabled={pending}
        onChange={(event) => setQuery(event.target.value)}
      />
      {customRoles.length === 0 ? (
        <p className="text-sm text-muted">{t('roles.emptyCustomBody')}</p>
      ) : null}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted">{t('roles.membersEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {filtered.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{member.displayName}</p>
                <p className="truncate text-xs text-muted">
                  {formatMembershipRole(member.role, t)}
                </p>
              </div>
              <div className="w-full sm:w-52">
                <GroupSelect
                  aria-label={t('roles.assignRoleToMember', { name: member.displayName })}
                  value={currentRoleId(member)}
                  disabled={pending || customRoles.length === 0}
                  options={roleOptions}
                  onChange={(roleId) => setRole(member, roleId)}
                />
              </div>
              {member.role === 'Owner' ? null : (
                <GroupButton
                  variant="secondary"
                  type="button"
                  onClick={() => onManageResourceAccess(member)}
                  disabled={pending}
                  aria-label={t('roles.manageSongAccessFor', { name: member.displayName })}
                >
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                  {t('roles.manageSongAccess')}
                </GroupButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </GroupDialog>
  )
}
