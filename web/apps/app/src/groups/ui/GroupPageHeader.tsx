import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../ui/cn'
import { GroupIconWell } from './GroupCard'

export type GroupBreadcrumbItem = { to?: string; label: string }

/** Group-scoped breadcrumb: `Grupo / Sección`, each crumb a 44px target. */
export function GroupBreadcrumb({
  items,
  className,
}: {
  items: GroupBreadcrumbItem[]
  className?: string
}) {
  return (
    <nav aria-label="Ruta" className={cn('text-sm text-muted', className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.to ? (
              <Link
                to={item.to}
                className="inline-flex min-h-11 items-center font-medium text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export type GroupPageHeaderProps = {
  title: string
  subtitle?: string
  /** Accent icon well to the left of the title. */
  icon?: LucideIcon
  breadcrumb?: GroupBreadcrumbItem[]
  /** Primary/secondary actions rendered top-right (wrap on mobile). */
  actions?: ReactNode
  /** `id` for the `<h1>` so `section[aria-labelledby]` can point at it. */
  headingId?: string
  /** Extra content under the title row (filters, tabs, search). */
  children?: ReactNode
  className?: string
}

/**
 * Page header for every group section (ADR-0074 §4): breadcrumb, accent icon,
 * display type, and the page's actions. Replaces the per-page inline `<header>`
 * so headings, spacing and action placement are identical everywhere and follow
 * the group accent live.
 */
export function GroupPageHeader({
  title,
  subtitle,
  icon,
  breadcrumb,
  actions,
  headingId,
  children,
  className,
}: GroupPageHeaderProps) {
  return (
    <header className={cn('space-y-4', className)}>
      {breadcrumb?.length ? <GroupBreadcrumb items={breadcrumb} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {icon ? <GroupIconWell icon={icon} size="lg" /> : null}
          <div className="min-w-0 space-y-1">
            <h1
              id={headingId}
              className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
            >
              {title}
            </h1>
            {subtitle ? <p className="text-sm text-muted sm:text-base">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}
