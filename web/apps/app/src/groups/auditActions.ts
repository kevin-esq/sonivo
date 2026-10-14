import { Activity, LogOut, Music2, ShieldCheck, UserMinus, UserPlus, XCircle, type LucideIcon } from 'lucide-react'
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
