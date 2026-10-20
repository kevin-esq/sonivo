import {
  CalendarDays,
  CheckCircle2,
  Crown,
  Eye,
  Fingerprint,
  Layers,
  Library,
  ListMusic,
  Music2,
  Music4,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { I18nKey } from '../../i18n'

/**
 * Display catalogue for group permissions (ADR-0080).
 *
 * This mirrors the canonical keys of `GroupPermissions` and the base-role sets
 * of `GroupPermissions.BaseRolePermissions` on the server. The server stays
 * authoritative: these tables only drive presentation, and a permission is only
 * ever *granted* by a server check — `GroupAccessService.RequirePermissionAsync`
 * resolves the same set per request.
 *
 * Granularity is one key per ACTION, the Discord model: a group can let a member
 * add songs but never delete one, without inventing a whole new role.
 */

export type PermissionDef = {
  /** Canonical server key (`GroupPermissions`). */
  key: string
  labelKey: I18nKey
  descriptionKey: I18nKey
  /** An Owner may grant this through a custom role (`GroupPermissions.Assignable`). */
  assignable: boolean
}

export type PermissionCategory = {
  id: string
  labelKey: I18nKey
  icon: LucideIcon
  /** Categories holding Owner-only capabilities are shown but not grantable. */
  permissions: PermissionDef[]
}

/** The canonical permissions, grouped for the detail panel. */
export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'songs',
    labelKey: 'roles.catSongs',
    icon: Music2,
    permissions: [
      { key: 'song.view', labelKey: 'roles.permSongView', descriptionKey: 'roles.permSongViewDesc', assignable: true },
      { key: 'song.create', labelKey: 'roles.permSongCreate', descriptionKey: 'roles.permSongCreateDesc', assignable: true },
      { key: 'song.edit', labelKey: 'roles.permSongEdit', descriptionKey: 'roles.permSongEditDesc', assignable: true },
      { key: 'song.delete', labelKey: 'roles.permSongDelete', descriptionKey: 'roles.permSongDeleteDesc', assignable: true },
    ],
  },
  {
    id: 'arrangements',
    labelKey: 'roles.catArrangements',
    icon: Music4,
    permissions: [
      { key: 'arrangement.view', labelKey: 'roles.permArrangementView', descriptionKey: 'roles.permArrangementViewDesc', assignable: true },
      { key: 'arrangement.create', labelKey: 'roles.permArrangementCreate', descriptionKey: 'roles.permArrangementCreateDesc', assignable: true },
      { key: 'arrangement.edit', labelKey: 'roles.permArrangementEdit', descriptionKey: 'roles.permArrangementEditDesc', assignable: true },
      { key: 'arrangement.delete', labelKey: 'roles.permArrangementDelete', descriptionKey: 'roles.permArrangementDeleteDesc', assignable: true },
    ],
  },
  {
    id: 'resources',
    labelKey: 'roles.catResources',
    icon: Library,
    permissions: [
      { key: 'resource.view', labelKey: 'roles.permResourceView', descriptionKey: 'roles.permResourceViewDesc', assignable: true },
      { key: 'resource.upload', labelKey: 'roles.permResourceUpload', descriptionKey: 'roles.permResourceUploadDesc', assignable: true },
      { key: 'resource.edit', labelKey: 'roles.permResourceEdit', descriptionKey: 'roles.permResourceEditDesc', assignable: true },
      { key: 'resource.delete', labelKey: 'roles.permResourceDelete', descriptionKey: 'roles.permResourceDeleteDesc', assignable: true },
      { key: 'resource.digitize', labelKey: 'roles.permResourceDigitize', descriptionKey: 'roles.permResourceDigitizeDesc', assignable: true },
    ],
  },
  {
    id: 'setlists',
    labelKey: 'roles.catSetlists',
    icon: ListMusic,
    permissions: [
      { key: 'setlist.view', labelKey: 'roles.permSetlistView', descriptionKey: 'roles.permSetlistViewDesc', assignable: true },
      { key: 'setlist.create', labelKey: 'roles.permSetlistCreate', descriptionKey: 'roles.permSetlistCreateDesc', assignable: true },
      { key: 'setlist.edit', labelKey: 'roles.permSetlistEdit', descriptionKey: 'roles.permSetlistEditDesc', assignable: true },
      { key: 'setlist.delete', labelKey: 'roles.permSetlistDelete', descriptionKey: 'roles.permSetlistDeleteDesc', assignable: true },
      { key: 'setlist.apply', labelKey: 'roles.permSetlistApply', descriptionKey: 'roles.permSetlistApplyDesc', assignable: true },
    ],
  },
  {
    id: 'events',
    labelKey: 'roles.catOrganization',
    icon: CalendarDays,
    permissions: [
      { key: 'event.view', labelKey: 'roles.permEventView', descriptionKey: 'roles.permEventViewDesc', assignable: true },
      { key: 'event.create', labelKey: 'roles.permEventCreate', descriptionKey: 'roles.permEventCreateDesc', assignable: true },
      { key: 'event.edit', labelKey: 'roles.permEventEdit', descriptionKey: 'roles.permEventEditDesc', assignable: true },
      { key: 'event.cancel', labelKey: 'roles.permEventCancel', descriptionKey: 'roles.permEventCancelDesc', assignable: true },
      { key: 'event.rsvp.respond', labelKey: 'rolePermission.respondRsvp', descriptionKey: 'roles.permRsvpEventsDesc', assignable: true },
      { key: 'event.rsvp.view', labelKey: 'roles.permViewRsvps', descriptionKey: 'roles.permViewRsvpsDesc', assignable: true },
    ],
  },
  {
    id: 'tasks',
    labelKey: 'roles.catTasks',
    icon: CheckCircle2,
    permissions: [
      { key: 'task.view', labelKey: 'roles.permTaskView', descriptionKey: 'roles.permTaskViewDesc', assignable: true },
      { key: 'task.create', labelKey: 'roles.permTaskCreate', descriptionKey: 'roles.permTaskCreateDesc', assignable: true },
      { key: 'task.edit', labelKey: 'roles.permTaskEdit', descriptionKey: 'roles.permTaskEditDesc', assignable: true },
      { key: 'task.assign', labelKey: 'roles.permTaskAssign', descriptionKey: 'roles.permTaskAssignDesc', assignable: true },
      { key: 'task.complete', labelKey: 'roles.permTaskComplete', descriptionKey: 'roles.permTaskCompleteDesc', assignable: true },
      { key: 'task.delete', labelKey: 'roles.permTaskDelete', descriptionKey: 'roles.permTaskDeleteDesc', assignable: true },
    ],
  },
  {
    id: 'participation',
    labelKey: 'roles.catParticipation',
    icon: Fingerprint,
    permissions: [
      { key: 'practice', labelKey: 'rolePermission.practice', descriptionKey: 'roles.permPracticeDesc', assignable: true },
      { key: 'conduct', labelKey: 'roles.permConduct', descriptionKey: 'roles.permConductDesc', assignable: true },
    ],
  },
  {
    id: 'administration',
    labelKey: 'roles.catAdministration',
    icon: Settings2,
    permissions: [
      { key: 'manage_group', labelKey: 'roles.permManageGroup', descriptionKey: 'roles.permManageGroupDesc', assignable: false },
      { key: 'manage_branding', labelKey: 'roles.permManageBranding', descriptionKey: 'roles.permManageBrandingDesc', assignable: false },
      { key: 'manage_members', labelKey: 'roles.permManageMembers', descriptionKey: 'roles.permManageMembersDesc', assignable: false },
      { key: 'manage_roles', labelKey: 'roles.permManageRoles', descriptionKey: 'roles.permManageRolesDesc', assignable: false },
      { key: 'manage_member_profiles', labelKey: 'roles.permManageMemberProfiles', descriptionKey: 'roles.permManageMemberProfilesDesc', assignable: true },
      { key: 'manage_billing', labelKey: 'roles.permManageBilling', descriptionKey: 'roles.permManageBillingDesc', assignable: false },
      { key: 'export_group', labelKey: 'roles.permExportGroup', descriptionKey: 'roles.permExportGroupDesc', assignable: false },
      { key: 'delete_group', labelKey: 'roles.permDeleteGroup', descriptionKey: 'roles.permDeleteGroupDesc', assignable: false },
    ],
  },
]

export const ALL_PERMISSIONS: PermissionDef[] = PERMISSION_CATEGORIES.flatMap(
  (category) => category.permissions,
)

export const ASSIGNABLE_PERMISSIONS = ALL_PERMISSIONS.filter(
  (permission) => permission.assignable,
)

export const ASSIGNABLE_KEYS = ASSIGNABLE_PERMISSIONS.map((permission) => permission.key)
export type BaseRole = 'Owner' | 'Manager' | 'Member' | 'Viewer'

export const BASE_ROLES: BaseRole[] = ['Owner', 'Manager', 'Member', 'Viewer']

export const BASE_ROLE_LABEL: Record<BaseRole, I18nKey> = {
  Owner: 'roles.roleOwner',
  Manager: 'roles.roleManager',
  Member: 'roles.roleMember',
  Viewer: 'roles.roleViewer',
}

export const BASE_ROLE_ICON: Record<BaseRole, LucideIcon> = {
  Owner: Crown,
  Manager: ShieldCheck,
  Member: Users,
  Viewer: Eye,
}

/** Category a permission belongs to, for grouping in the UI. */
export function categoryOf(key: string): PermissionCategory | undefined {
  return PERMISSION_CATEGORIES.find((category) =>
    category.permissions.some((permission) => permission.key === key),
  )
}
