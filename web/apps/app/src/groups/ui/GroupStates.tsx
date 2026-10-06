import type { ReactNode } from 'react'
import { Link2, Package, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '../../ui/cn'

/** Group-scoped empty state: accent icon, title, body and one primary action. */
export function GroupEmptyState({
  icon: Icon = Package,
  title,
  description,
  action,
  className,
  testId,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-subtle bg-surface-hover/60 px-6 py-10 text-center',
        className,
      )}
    >
      <span
        className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary-ink"
        aria-hidden="true"
      >
        <Icon className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <p className="font-semibold text-ink">{title}</p>
        {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

/** Group-scoped error state: `role="alert"`, optional retry. */
export function GroupErrorState({
  message,
  title = 'Algo salió mal',
  onRetry,
  retryLabel = 'Reintentar',
  action,
  className,
}: {
  message: string | null
  title?: string
  onRetry?: () => void
  retryLabel?: string
  action?: ReactNode
  className?: string
}) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-2xl border border-error/25 bg-error/10 px-5 py-4',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-error-ink">
        <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="font-semibold">{title}</p>
      </div>
      <p className="text-sm text-error-ink">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-error/30 px-3 text-sm font-semibold text-error-ink transition-colors hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error motion-reduce:transition-none"
        >
          <Link2 className="h-4 w-4 rotate-90" aria-hidden="true" />
          {retryLabel}
        </button>
      ) : null}
      {action}
    </div>
  )
}

/** Group-scoped content skeleton (surface-aware, follows light/dark). */
export function GroupSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-hover/80', className)} aria-hidden="true" />
}

export function GroupListSkeleton({ rows = 3, label = 'Cargando…' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-border-subtle px-4 py-3">
          <GroupSkeleton className="h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <GroupSkeleton className="h-4 w-40" />
            <GroupSkeleton className="h-3 w-56 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function GroupPageSkeleton({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <GroupSkeleton className="h-8 w-48" />
      <GroupSkeleton className="h-4 w-72 max-w-full" />
      <GroupListSkeleton rows={3} label={label} />
    </div>
  )
}
