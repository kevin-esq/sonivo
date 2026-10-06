import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../ui/cn'

/** Group-scoped surface card. `interactive` adds the accent hover treatment. */
const groupCardVariants = cva(
  'rounded-2xl border border-border-subtle bg-surface text-ink',
  {
    variants: {
      tone: {
        surface: '',
        muted: 'bg-surface-hover',
        accent: 'border-primary/30 bg-primary/5',
      },
      interactive: {
        true: 'transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
      },
      padding: {
        none: '',
        sm: 'p-3',
        default: 'p-4 sm:p-5',
        lg: 'p-5 sm:p-6',
      },
    },
    defaultVariants: { tone: 'surface', padding: 'default' },
  },
)

export type GroupCardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof groupCardVariants>

export function GroupCard({
  className,
  tone,
  interactive,
  padding,
  ...props
}: GroupCardProps) {
  return (
    <div
      className={cn(groupCardVariants({ tone, interactive, padding }), className)}
      {...props}
    />
  )
}

export type GroupStatProps = {
  icon: LucideIcon
  label: string
  description?: string
  value?: ReactNode
  to?: string
  testId?: string
}

/**
 * Home dashboard tile: accent icon well + label + one-line description. Renders
 * as an anchor when `to` is given, otherwise a static card (still 44px+ tall).
 */
export function GroupStat({ icon: Icon, label, description, value, to, testId }: GroupStatProps) {
  const body = (
    <>
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-ink"
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{label}</span>
        {description ? (
          <span className="block truncate text-xs text-muted">{description}</span>
        ) : null}
      </span>
      {value != null ? (
        <span className="shrink-0 font-display text-lg font-semibold text-ink">{value}</span>
      ) : null}
    </>
  )

  const classes = cn(
    'flex min-h-16 items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3 no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
  )

  if (to) {
    return (
      <Link to={to} data-testid={testId} className={classes}>
        {body}
      </Link>
    )
  }
  return (
    <div data-testid={testId} className={classes}>
      {body}
    </div>
  )
}

const CHIP_TONES = {
  neutral: 'bg-surface-hover text-muted',
  accent: 'bg-primary/15 text-primary-ink',
  success: 'bg-success/20 text-success-ink',
  warning: 'bg-warning/20 text-ink',
  error: 'bg-error/15 text-error-ink',
  outline: 'border border-border-subtle text-muted',
} as const

export type GroupChipTone = keyof typeof CHIP_TONES

/** Inline status/label pill; never carries status by colour alone (has text). */
export function GroupChip({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
  testId,
}: {
  tone?: GroupChipTone
  icon?: LucideIcon
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        CHIP_TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/** Icon + label tile used inside cards/lists (accent well, fixed size). */
export function GroupIconWell({
  icon: Icon,
  size = 'md',
  tone = 'accent',
  className,
}: {
  icon: LucideIcon
  size?: 'sm' | 'md' | 'lg'
  tone?: 'accent' | 'success' | 'neutral'
  className?: string
}) {
  const sizeClass = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-14 w-14' : 'h-11 w-11'
  const toneClass =
    tone === 'success'
      ? 'bg-success/20 text-success-ink'
      : tone === 'neutral'
        ? 'bg-surface-hover text-muted'
        : 'bg-primary/15 text-primary-ink'
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-xl', sizeClass, toneClass, className)}
      aria-hidden="true"
    >
      <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
    </span>
  )
}

/** Plain icon button with a 44px hit area (rail/list row affordances). */
export function GroupIconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}
