import { ALL_PERMISSIONS, ASSIGNABLE_KEYS, BASE_ROLES, type BaseRole } from './permissionCatalog'

const PERMISSION_BY_KEY = new Map(ALL_PERMISSIONS.map((p) => [p.key, p]))

/** Splits a role's comma-separated `permissions` column into canonical keys. */
export function parsePermissions(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => PERMISSION_BY_KEY.has(part))
}

function isBaseRole(value: string): value is BaseRole {
  return (BASE_ROLES as string[]).includes(value)
}

/**
 * Display mirror of the server's `GroupPermissions.BaseRolePermissions`: the
 * permission set a member holds from their base membership role alone. Kept in
 * lockstep with the domain — the server is the authority, this only previews.
 */
const BASE_ROLE_PERMISSIONS: Record<BaseRole, string[]> = {
  Owner: [
    'manage_group', 'manage_branding', 'manage_members', 'manage_roles',
    'manage_billing', 'export_group', 'delete_group',
    'song.view', 'song.create', 'song.edit', 'song.delete',
    'arrangement.view', 'arrangement.create', 'arrangement.edit', 'arrangement.delete',
    'resource.view', 'resource.upload', 'resource.edit', 'resource.delete', 'resource.digitize',
    'setlist.view', 'setlist.create', 'setlist.edit', 'setlist.delete', 'setlist.apply',
    'event.view', 'event.create', 'event.edit', 'event.cancel',
    'event.rsvp.respond', 'event.rsvp.view',
    'task.view', 'task.create', 'task.edit', 'task.assign', 'task.complete', 'task.delete',
    'practice', 'conduct', 'manage_member_profiles',
  ],
  Manager: [
    'song.view', 'song.create', 'song.edit', 'song.delete',
    'arrangement.view', 'arrangement.create', 'arrangement.edit', 'arrangement.delete',
    'resource.view', 'resource.upload', 'resource.edit', 'resource.delete', 'resource.digitize',
    'setlist.view', 'setlist.create', 'setlist.edit', 'setlist.delete', 'setlist.apply',
    'event.view', 'event.create', 'event.edit', 'event.cancel',
    'event.rsvp.respond', 'event.rsvp.view',
    'task.view', 'task.create', 'task.edit', 'task.assign', 'task.complete', 'task.delete',
    'practice', 'conduct',
  ],
  Member: [
    'song.view', 'arrangement.view', 'resource.view',
    'setlist.view', 'event.view', 'event.rsvp.respond',
    'task.view', 'task.complete', 'practice',
  ],
  Viewer: [
    'song.view', 'arrangement.view', 'resource.view',
    'setlist.view', 'event.view', 'practice',
  ],
}

/** The permission set a member holds from their base role alone (set form). */
export function baseRolePermissions(role: string): Set<string> {
  return new Set(isBaseRole(role) ? BASE_ROLE_PERMISSIONS[role] : [])
}

/**
 * Permission dependencies: a capability implies the ones it builds on.
 * Mirrors `GroupPermissions.Dependencies` on the server — the server stays the
 * authority, this exists so the UI can hide what is genuinely unreachable
 * instead of offering a switch that would silently widen more than the Owner
 * asked for.
 */
const DEPENDENCIES: Record<string, string[]> = {
  'song.edit': ['song.view'],
  'song.delete': ['song.view'],

  'arrangement.view': ['song.view'],
  'arrangement.create': ['song.view'],
  'arrangement.edit': ['song.view'],
  'arrangement.delete': ['song.view'],

  'resource.view': [],
  'resource.upload': ['resource.view'],
  'resource.edit': ['resource.view'],
  'resource.delete': ['resource.view'],
  'resource.digitize': ['resource.view'],

  'setlist.view': [],
  'setlist.create': [],
  'setlist.edit': ['setlist.view'],
  'setlist.delete': ['setlist.view'],
  'setlist.apply': ['setlist.view', 'event.view'],

  'event.view': [],
  'event.create': [],
  'event.edit': ['event.view'],
  'event.cancel': ['event.view'],
  'event.rsvp.respond': ['event.view'],
  'event.rsvp.view': ['event.view'],

  'task.view': [],
  'task.create': [],
  'task.edit': ['task.view'],
  'task.delete': ['task.view'],
  'task.assign': ['task.view'],
  'task.complete': ['task.view'],

  conduct: ['event.view'],
}

/** Every capability a permission pulls in with it, transitively. */
export function expandPermissions(permissions: readonly string[]): Set<string> {
  const out = new Set<string>()
  const queue = [...permissions]
  while (queue.length > 0) {
    const current = queue.pop()!
    if (!current || out.has(current)) continue
    out.add(current)
    for (const parent of DEPENDENCIES[current] ?? []) {
      if (!out.has(parent)) queue.push(parent)
    }
  }
  return out
}

/** Adds the capabilities required by each selected action. */
export function includePermissionDependencies(permissions: readonly string[]): string[] {
  return [...expandPermissions(permissions)].filter((permission) =>
    ASSIGNABLE_KEYS.includes(permission),
  )
}

/** Removes a permission and actions that cannot work without it. */
export function removePermissionAndDependents(
  permissions: readonly string[],
  permission: string,
): string[] {
  return permissions.filter(
    (candidate) => candidate !== permission && !expandPermissions([candidate]).has(permission),
  )
}

/**
 * Does this member hold the capability? Resolves dependencies the same way the
 * server does, so the UI never offers something the API would refuse.
 */
export function hasPermission(
  granted: readonly string[] | Set<string>,
  permission: string,
): boolean {
  return expandPermissions([...granted]).has(permission)
}

/** Mirrors the server's exact/legacy profile resolution for previews. */
export function effectivePermissions(
  role: string,
  customPermissions: readonly string[],
  extendsBaseRole = false,
): Set<string> {
  if (role === 'Owner') return expandPermissions([...baseRolePermissions(role)])
  const granted = extendsBaseRole ? [...baseRolePermissions(role)] : []
  for (const permission of customPermissions) {
    if (ASSIGNABLE_KEYS.includes(permission)) {
      granted.push(permission)
    }
  }
  return expandPermissions(granted)
}
