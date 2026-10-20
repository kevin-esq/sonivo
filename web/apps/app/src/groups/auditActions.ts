import { Activity, CheckSquare, Download, LogOut, Music2, Pencil, ShieldCheck, Trash2, UserMinus, UserPlus, XCircle, type LucideIcon } from 'lucide-react'
import type { I18nKey } from '../i18n'

/**
 * Group audit actions (ADR-0051 append-only log) → icon, localized label and
 * icon tone. Shared by the group audit view and the member profile activity
 * feed so one action never renders with two different meanings.
 */
export const AUDIT_ACTION_META: Record<
  string,
  { icon: LucideIcon; labelKey: I18nKey; tone: string }
> = {
  role_changed: {
    icon: ShieldCheck,
    labelKey: 'audit.action.roleChanged',
    tone: 'bg-primary/15 text-primary-ink',
  },
  group_role_created: {
    icon: ShieldCheck,
    labelKey: 'audit.action.groupRoleCreated',
    tone: 'bg-primary/15 text-primary-ink',
  },
  group_role_updated: {
    icon: ShieldCheck,
    labelKey: 'audit.action.groupRoleUpdated',
    tone: 'bg-primary/15 text-primary-ink',
  },
  group_role_deleted: {
    icon: ShieldCheck,
    labelKey: 'audit.action.groupRoleDeleted',
    tone: 'bg-error/15 text-error-ink',
  },
  group_role_assigned: {
    icon: ShieldCheck,
    labelKey: 'audit.action.groupRoleAssigned',
    tone: 'bg-primary/15 text-primary-ink',
  },
  resource_grant_changed: {
    icon: ShieldCheck,
    labelKey: 'audit.action.resourceGrantChanged',
    tone: 'bg-primary/15 text-primary-ink',
  },
  group_report_exported: {
    icon: Download,
    labelKey: 'audit.action.groupReportExported',
    tone: 'bg-primary/15 text-primary-ink',
  },
  task_created: { icon: CheckSquare, labelKey: 'audit.action.taskCreated', tone: 'bg-success/15 text-success-ink' },
  task_updated: { icon: Pencil, labelKey: 'audit.action.taskUpdated', tone: 'bg-primary/15 text-primary-ink' },
  task_status_changed: { icon: CheckSquare, labelKey: 'audit.action.taskStatusChanged', tone: 'bg-primary/15 text-primary-ink' },
  task_deleted: { icon: Trash2, labelKey: 'audit.action.taskDeleted', tone: 'bg-error/15 text-error-ink' },
  song_created: { icon: Music2, labelKey: 'audit.action.songCreated', tone: 'bg-success/15 text-success-ink' },
  song_updated: { icon: Pencil, labelKey: 'audit.action.songUpdated', tone: 'bg-primary/15 text-primary-ink' },
  song_deleted: { icon: Trash2, labelKey: 'audit.action.songDeleted', tone: 'bg-error/15 text-error-ink' },
  arrangement_created: { icon: Music2, labelKey: 'audit.action.arrangementCreated', tone: 'bg-success/15 text-success-ink' },
  arrangement_updated: { icon: Pencil, labelKey: 'audit.action.arrangementUpdated', tone: 'bg-primary/15 text-primary-ink' },
  arrangement_deleted: { icon: Trash2, labelKey: 'audit.action.arrangementDeleted', tone: 'bg-error/15 text-error-ink' },
  musical_role_changed: {
    icon: Music2,
    labelKey: 'audit.action.musicalRoleChanged',
    tone: 'bg-primary/15 text-primary-ink',
  },
  member_removed: {
    icon: UserMinus,
    labelKey: 'audit.action.memberRemoved',
    tone: 'bg-error/15 text-error-ink',
  },
  member_access_disabled: {
    icon: UserMinus,
    labelKey: 'audit.action.memberAccessDisabled',
    tone: 'bg-error/15 text-error-ink',
  },
  member_access_enabled: {
    icon: ShieldCheck,
    labelKey: 'audit.action.memberAccessEnabled',
    tone: 'bg-success/15 text-success-ink',
  },
  member_left: {
    icon: LogOut,
    labelKey: 'audit.action.memberLeft',
    tone: 'bg-surface-hover text-muted',
  },
  invitation_created: {
    icon: UserPlus,
    labelKey: 'audit.action.invitationCreated',
    tone: 'bg-success/15 text-success-ink',
  },
  invitation_revoked: {
    icon: XCircle,
    labelKey: 'audit.action.invitationRevoked',
    tone: 'bg-error/15 text-error-ink',
  },
}

/** Canonical action keys, in the order the filters should offer them. */
export const AUDIT_ACTION_KEYS: readonly string[] = Object.keys(AUDIT_ACTION_META)

/** Falls back to a neutral "activity" entry for actions added by the server later. */
export function auditActionMeta(action: string): {
  icon: LucideIcon
  labelKey: I18nKey
  tone: string
} {
  return (
    AUDIT_ACTION_META[action] ?? {
      icon: Activity,
      labelKey: 'audit.action.unknown' as I18nKey,
      tone: 'bg-surface-hover text-muted',
    }
  )
}
