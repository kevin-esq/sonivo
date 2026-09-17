import { cn } from './cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-slate-200/80', className)}
      aria-hidden="true"
    />
  )
}

export function ListSkeleton({
  rows = 3,
  label = 'Cargando…',
}: {
  rows?: number
  label?: string
}) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-slate-100 px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <ListSkeleton rows={3} label={label} />
    </div>
  )
}
