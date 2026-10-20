import { cn } from '../../ui/cn'

export function PermissionSwitch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
        checked ? 'border-primary/40 bg-primary-strong' : 'border-border-subtle bg-surface-hover',
        disabled ? 'cursor-not-allowed opacity-60' : '',
      )}
    >
      <span
        className={cn(
          'block h-5 w-5 rounded-full bg-surface shadow-sm transition-transform motion-reduce:transition-none',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
