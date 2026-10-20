import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { listGroupRoles, updateGroupRole, type GroupRole } from '../../api/client'
import type { MemberListItem } from '../../api/client'
import { useT, type I18nKey } from '../../i18n'
import { mutationErrorMessage } from '../../repertoire/ui'
import { useToast } from '../../ui/toast'
import { cn } from '../../ui/cn'
import {
  GroupButton,
  GroupCard,
  GroupErrorState,
  GroupIconWell,
  GroupListSkeleton,
} from '../ui'
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_KEYS,
  BASE_ROLE_ICON,
  BASE_ROLE_LABEL,
  BASE_ROLES,
  PERMISSION_CATEGORIES,
  type BaseRole,
} from './permissionCatalog'
import {
  baseRolePermissions,
  expandPermissions,
  includePermissionDependencies,
  parsePermissions,
  removePermissionAndDependents,
} from './permissionResolution'
import {
  CreateRoleDialog,
  DeleteRoleDialog,
  DuplicateRoleDialog,
  EditRoleInfoDialog,
  ManageMembersDialog,
} from './GroupRoleDialogs'
import { MemberResourceAccessDialog } from './MemberResourceAccessDialog'
import { PermissionCategoryBlock } from './PermissionCategoryBlock'
import { RoleMenu } from './RoleMenu'

/** A role shown in the list: either a base membership role or a custom one. */
type RoleEntry = {
  id: string
  name: string
  description: string | null
  permissions: string[]
  isSystem: boolean
  extendsBaseRole: boolean
  /** Base roles carry their own id; custom roles spread onto a base role. */
  baseRole?: BaseRole
}

function toSystemEntry(role: BaseRole): RoleEntry {
  return {
    id: role,
    name: role,
    description: null,
    permissions: [...baseRolePermissions(role)],
    isSystem: true,
    extendsBaseRole: false,
    baseRole: role,
  }
}

function toCustomEntry(role: GroupRole): RoleEntry {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    // A custom role may only ever hold assignable permissions (server-enforced);
    // discarding anything else here keeps a legacy or rogue row from being shown
    // as a locked grant, or echoed back in a save that the server would reject.
    permissions: parsePermissions(role.permissions).filter((key) => ASSIGNABLE_KEYS.includes(key)),
    isSystem: false,
    extendsBaseRole: role.extendsBaseRole,
  }
}

function roleIcon(entry: RoleEntry): LucideIcon {
  if (entry.isSystem && entry.baseRole) return BASE_ROLE_ICON[entry.baseRole]
  return ShieldCheck
}

function roleLabel(entry: RoleEntry, t: (key: I18nKey) => string): string {
  if (entry.isSystem && entry.baseRole) return t(BASE_ROLE_LABEL[entry.baseRole])
  return entry.name
}

function roleDescription(entry: RoleEntry, t: (key: I18nKey) => string): string {
  if (entry.isSystem && entry.baseRole) {
    const key = `roles.role${entry.baseRole}Desc` as I18nKey
    return t(key)
  }
  return entry.description ?? ''
}

type Filter = 'all' | 'system' | 'custom'

/** Accessible permission switch (never colour-only: it also shows a label). */
export function GroupRolesCenter({
  groupId,
  isOwner,
  members,
  onMembersChanged,
  registerCreate,
}: {
  groupId: string
  isOwner: boolean
  members: MemberListItem[]
  onMembersChanged?: () => void
  registerCreate?: (open: () => void) => void
}) {
  const { t } = useT()
  const { showToast } = useToast()

  const [roles, setRoles] = useState<GroupRole[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>('Owner')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<string[] | null>(null)
  const [modeDraft, setModeDraft] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<GroupRole | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<GroupRole | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GroupRole | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [resourceAccessTarget, setResourceAccessTarget] = useState<MemberListItem | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    void listGroupRoles(groupId)
      .then((items) => {
        if (!cancelled) {
          setRoles(items)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRoles([])
          setError(mutationErrorMessage(err, t))
        }
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  useEffect(load, [load])

  useEffect(() => {
    if (isOwner) registerCreate?.(() => setCreateOpen(true))
  }, [isOwner, registerCreate])

  const entries = useMemo<RoleEntry[]>(
    () => [...BASE_ROLES.map(toSystemEntry), ...(roles ?? []).map(toCustomEntry)],
    [roles],
  )

  const customCount = (roles ?? []).length
  const baseRoleMemberCount = members.filter((member) => !member.groupRoleId).length

  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const member of members) {
      if (member.groupRoleId) counts.set(member.groupRoleId, (counts.get(member.groupRoleId) ?? 0) + 1)
      counts.set(member.role, (counts.get(member.role) ?? 0) + 1)
    }
    return counts
  }, [members])

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (filter === 'system' && !entry.isSystem) return false
      if (filter === 'custom' && entry.isSystem) return false
      if (!needle) return true
      return roleLabel(entry, t).toLowerCase().includes(needle) || entry.name.toLowerCase().includes(needle)
    })
  }, [entries, filter, query, t])

  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0]!
  const customRole = !selected.isSystem ? (roles ?? []).find((role) => role.id === selected.id) ?? null : null

  // The draft only exists while a custom role's permissions are being edited.
  const currentPermissions = draft ?? selected.permissions
  const currentExtendsBaseRole = modeDraft ?? selected.extendsBaseRole
  const dirty =
    (draft !== null &&
      (draft.length !== selected.permissions.length ||
        draft.some((permission) => !selected.permissions.includes(permission)))) ||
    (modeDraft !== null && modeDraft !== selected.extendsBaseRole)

  function selectRole(id: string) {
    setSelectedId(id)
    setDraft(null)
    setModeDraft(null)
  }

  function togglePermission(permission: string) {
    if (!customRole) return
    setDraft((current) => {
      const base = current ?? selected.permissions
      return expandPermissions(base).has(permission)
        ? removePermissionAndDependents(base, permission)
        : includePermissionDependencies([...base, permission])
    })
  }

  async function savePermissions() {
    if (!customRole || !dirty) return
    setSaving(true)
    try {
      const updated = await updateGroupRole(groupId, customRole.id, {
        ...(draft !== null ? { permissions: draft } : {}),
        ...(modeDraft !== null ? { extendsBaseRole: modeDraft } : {}),
      })
      setRoles((current) =>
        (current ?? []).map((role) => (role.id === updated.id ? updated : role)),
      )
      setDraft(null)
      setModeDraft(null)
      showToast({ kind: 'ok', text: t('roles.toastRoleUpdated') })
    } catch (err) {
      showToast({ kind: 'error', text: mutationErrorMessage(err, t) })
    } finally {
      setSaving(false)
    }
  }

  const grantedTotal = expandPermissions(currentPermissions).size
  const permissionTotal = selected.isSystem ? ALL_PERMISSIONS.length : ASSIGNABLE_KEYS.length

  return (
    <div className="space-y-6">
      <dl
        className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border-subtle pb-3 text-xs"
        data-testid="roles-stats"
      >
        <div className="flex items-baseline gap-1.5">
          <dt className="text-muted">{t('roles.statRoles')}</dt>
          <dd className="font-semibold tabular-nums text-ink">{entries.length}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-muted">{t('roles.statCustom')}</dt>
          <dd className="font-semibold tabular-nums text-ink">{customCount}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-muted">{t('roles.statBaseRoleMembers')}</dt>
          <dd className="font-semibold tabular-nums text-ink">{baseRoleMemberCount}</dd>
        </div>
      </dl>

      {error ? <GroupErrorState message={error} onRetry={() => load()} /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        {/* Left: role list */}
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('roles.searchPlaceholder')}
                aria-label={t('roles.searchPlaceholder')}
                className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface pl-9 pr-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'system', 'custom'] as Filter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors',
                    filter === value
                      ? 'border-primary/40 bg-primary/15 text-primary-ink'
                      : 'border-border-subtle text-muted hover:bg-surface-hover',
                  )}
                >
                  {value === 'all'
                    ? t('roles.filterAll')
                    : value === 'system'
                      ? t('roles.filterSystem')
                      : t('roles.filterCustom')}
                </button>
              ))}
            </div>
          </div>

          {roles === null ? (
            <GroupListSkeleton rows={4} label={t('roles.loading')} />
          ) : visibleEntries.length === 0 ? (
            <GroupCard className="space-y-3 py-8 text-center">
              <p className="font-semibold text-ink">{t('roles.noResultsTitle')}</p>
              <p className="text-sm text-muted">{t('roles.noResultsBody')}</p>
              <GroupButton
                variant="soft"
                size="sm"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
              >
                {t('roles.clearFilters')}
              </GroupButton>
            </GroupCard>
          ) : (
            <ul className="space-y-2" data-testid="roles-list">
              {visibleEntries.map((entry) => {
                const Icon = roleIcon(entry)
                const active = entry.id === selected.id
                const count = memberCounts.get(entry.id) ?? 0
                const description = roleDescription(entry, t)
                return (
                  <li key={entry.id}>
                    <div
                      className={cn(
                        'flex items-start gap-3 rounded-2xl border bg-surface p-3 transition-colors',
                        active
                          ? 'border-primary/50 ring-1 ring-primary/30'
                          : 'border-border-subtle hover:bg-surface-hover',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => selectRole(entry.id)}
                        aria-current={active ? 'true' : undefined}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <GroupIconWell icon={Icon} size="sm" tone={active ? 'accent' : 'neutral'} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-ink">
                              {roleLabel(entry, t)}
                            </span>
                            {active ? (
                              <span className="sr-only">{t('roles.selected')}</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {entry.isSystem ? t('roles.systemBadge') : t('roles.customBadge')} ·{' '}
                            {count === 0
                              ? t('roles.nobodyAssigned')
                              : count === 1
                                ? t('roles.membersAssignedOne')
                                : t('roles.membersAssigned', { count })}
                          </span>
                          {description ? (
                            <span className="mt-1 block line-clamp-2 text-xs text-muted">
                              {description}
                            </span>
                          ) : null}
                        </span>
                      </button>

                      {isOwner && !entry.isSystem ? (
                        <RoleMenu
                          label={t('roles.actionsFor', { name: entry.name })}
                          onEdit={() => {
                            const role = (roles ?? []).find((item) => item.id === entry.id)
                            if (role) setEditTarget(role)
                          }}
                          onDuplicate={() => {
                            const role = (roles ?? []).find((item) => item.id === entry.id)
                            if (role) setDuplicateTarget(role)
                          }}
                          onManage={() => setManageOpen(true)}
                          onDelete={() => {
                            const role = (roles ?? []).find((item) => item.id === entry.id)
                            if (role) setDeleteTarget(role)
                          }}
                        />
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {isOwner && customCount === 0 && roles !== null ? (
            <GroupCard className="space-y-2 py-6 text-center" padding="sm">
              <p className="text-sm font-semibold text-ink">{t('roles.emptyCustomTitle')}</p>
              <p className="text-xs text-muted">{t('roles.emptyCustomBody')}</p>
              <GroupButton size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('roles.create')}
              </GroupButton>
            </GroupCard>
          ) : null}
        </div>

        {/* Right: selected role detail + permissions */}
        <GroupCard padding="none" className="overflow-hidden" data-testid="role-detail">
          <header className="flex flex-wrap items-start gap-3 border-b border-border-subtle p-4 sm:p-5">
            <GroupIconWell icon={roleIcon(selected)} size="md" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-ink">
                {roleLabel(selected, t)}
              </h2>
              <p className="text-xs text-muted">
                {selected.isSystem ? t('roles.systemBadge') : t('roles.customBadge')} ·{' '}
                {memberCounts.get(selected.id) === 1
                  ? t('roles.membersAssignedOne')
                  : t('roles.membersAssigned', { count: memberCounts.get(selected.id) ?? 0 })}
              </p>
              {roleDescription(selected, t) ? (
                <p className="mt-1 text-sm text-muted">{roleDescription(selected, t)}</p>
              ) : null}
            </div>
            {isOwner && customRole ? (
              <GroupButton variant="secondary" size="sm" onClick={() => setEditTarget(customRole)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t('roles.editRole')}
              </GroupButton>
            ) : null}
          </header>

          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-ink">{t('roles.permissionsTitle')}</h3>
            </div>
            <span className="text-xs font-semibold text-muted">
              {grantedTotal} / {permissionTotal}
            </span>
          </div>

          {selected.isSystem ? (
            <p className="border-b border-border-subtle bg-surface-hover/60 px-4 py-2.5 text-xs text-muted sm:px-5">
              {t('roles.permissionsLocked')}
            </p>
          ) : !isOwner ? (
            <p className="border-b border-border-subtle bg-surface-hover/60 px-4 py-2.5 text-xs text-muted sm:px-5">
              {t('roles.permissionsReadOnly')}
            </p>
          ) : null}

          {!selected.isSystem ? (
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t('roles.extendBaseTitle')}</p>
                <p className="text-xs text-muted">
                  {currentExtendsBaseRole
                    ? t('roles.extendBaseOnHint')
                    : t('roles.extendBaseOffHint')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={currentExtendsBaseRole}
                aria-label={t('roles.extendBaseTitle')}
                disabled={!isOwner || saving}
                onClick={() => setModeDraft((value) => !(value ?? selected.extendsBaseRole))}
                className={cn(
                  'inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  currentExtendsBaseRole
                    ? 'border-primary/40 bg-primary-strong'
                    : 'border-border-subtle bg-surface-hover',
                  !isOwner || saving ? 'cursor-not-allowed opacity-60' : '',
                )}
              >
                <span
                  className={cn(
                    'block h-5 w-5 rounded-full bg-surface shadow-sm transition-transform motion-reduce:transition-none',
                    currentExtendsBaseRole ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>
          ) : null}

          <div className="divide-y divide-border-subtle">
            {PERMISSION_CATEGORIES.map((category) => (
              <PermissionCategoryBlock
                key={category.id}
                category={category}
                granted={currentPermissions}
                mode={selected.isSystem ? 'system' : isOwner ? 'editable' : 'readonly'}
                pending={saving}
                onToggle={togglePermission}
              />
            ))}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-hover/40 px-4 py-3 sm:px-5">
            <p className="text-xs text-muted">
              {dirty
                ? t('roles.unsavedBody')
                : currentExtendsBaseRole
                  ? t('roles.extendBaseOnHint')
                  : t('roles.saveHint')}
            </p>
            {dirty ? (
              <div className="flex items-center gap-2">
                <GroupButton variant="secondary" size="sm" onClick={() => { setDraft(null); setModeDraft(null) }} disabled={saving}>
                  {t('roles.discard')}
                </GroupButton>
                <GroupButton size="sm" onClick={() => void savePermissions()} disabled={saving}>
                  {saving ? t('roles.savePending') : t('groupRole.save')}
                </GroupButton>
              </div>
            ) : null}
          </footer>
        </GroupCard>
      </div>

      {isOwner ? (
        <>
          <CreateRoleDialog
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            groupId={groupId}
            onCreated={(role) => {
              setRoles((current) => [...(current ?? []), role])
              setSelectedId(role.id)
              setDraft(null)
              showToast({ kind: 'ok', text: t('roles.toastRoleCreated') })
            }}
          />
          <EditRoleInfoDialog
            open={editTarget !== null}
            onClose={() => setEditTarget(null)}
            groupId={groupId}
            role={editTarget}
            onUpdated={(role) => {
              setRoles((current) => (current ?? []).map((item) => (item.id === role.id ? role : item)))
              showToast({ kind: 'ok', text: t('roles.toastRoleUpdated') })
            }}
          />
          <DuplicateRoleDialog
            open={duplicateTarget !== null}
            onClose={() => setDuplicateTarget(null)}
            groupId={groupId}
            role={duplicateTarget}
            onDuplicated={(role) => {
              setRoles((current) => [...(current ?? []), role])
              setSelectedId(role.id)
              showToast({ kind: 'ok', text: t('roles.toastRoleDuplicated') })
            }}
          />
          <DeleteRoleDialog
            open={deleteTarget !== null}
            onClose={() => setDeleteTarget(null)}
            groupId={groupId}
            role={deleteTarget}
            memberCount={deleteTarget ? memberCounts.get(deleteTarget.id) ?? 0 : 0}
            onDeleted={(roleId) => {
              setRoles((current) => (current ?? []).filter((role) => role.id !== roleId))
              setSelectedId('Owner')
              showToast({ kind: 'ok', text: t('roles.toastRoleDeleted') })
            }}
          />
          <ManageMembersDialog
            open={manageOpen}
            onClose={() => setManageOpen(false)}
            groupId={groupId}
            roles={roles ?? []}
            members={members}
            onManageResourceAccess={(member) => {
              setManageOpen(false)
              setResourceAccessTarget(member)
            }}
            onSaved={() => {
              showToast({ kind: 'ok', text: t('roles.toastAssignmentsSaved') })
              onMembersChanged?.()
            }}
          />
          <MemberResourceAccessDialog
            open={resourceAccessTarget !== null}
            onClose={() => setResourceAccessTarget(null)}
            groupId={groupId}
            member={resourceAccessTarget}
          />
        </>
      ) : null}
    </div>
  )
}
