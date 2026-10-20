import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useT } from '../../i18n'
import { cn } from '../../ui/cn'
import { ASSIGNABLE_KEYS, PERMISSION_CATEGORIES } from './permissionCatalog'
import { expandPermissions } from './permissionResolution'
import { PermissionRow } from './PermissionRow'

export function PermissionCategoryBlock({
  category,
  granted,
  mode,
  pending,
  onToggle,
}: {
  category: (typeof PERMISSION_CATEGORIES)[number]
  granted: string[]
  /** `system` = base role (all locked), `editable` = custom role as owner, else read-only. */
  mode: 'system' | 'editable' | 'readonly'
  pending?: boolean
  onToggle: (permission: string) => void
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const effective = expandPermissions(granted)
  const count = category.permissions.filter((permission) => effective.has(permission.key)).length
  const Icon = category.icon

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-hover/60 sm:px-5"
      >
        <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold text-ink">{t(category.labelKey)}</span>
        <span className="text-xs text-muted">
          {count} / {category.permissions.length}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted transition-transform', open ? '' : '-rotate-90')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="divide-y divide-border-subtle border-t border-border-subtle">
          {category.permissions.map((permission) => {
            const checked = effective.has(permission.key)
            const assignable = ASSIGNABLE_KEYS.includes(permission.key)
            const editable = mode === 'editable' && assignable
            return (
              <PermissionRow
                key={permission.key}
                label={t(permission.labelKey)}
                description={t(permission.descriptionKey)}
                checked={checked}
                editable={editable}
                ownerOnly={!assignable}
                pending={pending}
                onToggle={() => onToggle(permission.key)}
              />
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
