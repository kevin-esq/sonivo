import { Check, Lock, X } from 'lucide-react'
import { useT } from '../../i18n'
import { cn } from '../../ui/cn'
import { PermissionSwitch } from './PermissionSwitch'

export function PermissionRow({
  label,
  description,
  checked,
  editable,
  ownerOnly,
  pending,
  onToggle,
}: {
  label: string
  description?: string
  checked: boolean
  editable: boolean
  ownerOnly: boolean
  pending?: boolean
  onToggle: () => void
}) {
  const { t } = useT()
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
        {ownerOnly ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {t('roles.ownerOnlyPermission')}
          </p>
        ) : null}
      </div>
      {editable ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn('text-xs font-semibold', checked ? 'text-primary-ink' : 'text-muted')}>
            {checked ? t('roles.allowed') : t('roles.deny')}
          </span>
          <PermissionSwitch
            checked={checked}
            disabled={pending}
            label={label}
            onToggle={onToggle}
          />
        </div>
      ) : (
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold', checked ? 'text-primary-ink' : 'text-muted')}>
          {checked ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <X className="h-4 w-4" aria-hidden="true" />
          )}
          {checked ? t('roles.allowed') : t('roles.deny')}
        </span>
      )}
    </div>
  )
}
