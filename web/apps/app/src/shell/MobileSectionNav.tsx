import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AppNavLink } from '../routing/AppLink'
import { cn } from '../ui/cn'

export type MobileSectionItem = {
  id: string
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

/** Touch navigation scrolls within its own row, keeping the page at its current position. */
export function MobileSectionNav({ items, label, className, action }: {
  items: MobileSectionItem[]
  label: string
  className?: string
  action?: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const row = ref.current
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !active) return
    if (active.offsetLeft < row.scrollLeft || active.offsetLeft + active.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, active.offsetLeft - 16), behavior: 'auto' })
    }
  }, [items])

  return (
    <div className={cn('flex min-w-0 items-start gap-2', className)}>
    <nav
      ref={ref}
      aria-label={label}
      data-testid="mobile-section-nav"
      className="no-scrollbar relative flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-3 pt-1"
    >
      {items.map((item) => (
        <AppNavLink
          key={item.id}
          to={item.to}
          end={item.end}
          className={({ isActive }) => cn(
            'flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none',
            isActive
              ? 'border-transparent bg-primary-strong text-primary-foreground'
              : 'border-shell-border bg-shell text-shell-foreground/80 hover:bg-shell-hover',
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {item.label}
        </AppNavLink>
      ))}
    </nav>
    {action ? <div className="shrink-0 pb-3 pr-4 pt-1">{action}</div> : null}
    </div>
  )
}
