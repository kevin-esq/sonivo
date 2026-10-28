import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { useT } from '../i18n'
import { cn } from '../ui/cn'

/** The brand stays in the full-width header while only navigation expands below. */
export function ShellHeaderBrand({
  pinned,
  onToggle,
  group = false,
  children,
}: {
  pinned: boolean
  onToggle: () => void
  group?: boolean
  children: ReactNode
}) {
  const { t } = useT()
  return (
    <div
      data-testid="shell-header-brand"
      className={cn(
        'h-16 shrink-0 items-center gap-3 bg-shell px-[14px] text-shell-foreground',
        group ? 'flex min-w-0 flex-1 md:w-60 md:flex-none' : 'hidden w-64 lg:flex',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={pinned ? t('workspace.collapseRail') : t('workspace.expandRail')}
        aria-expanded={pinned}
        aria-controls={group ? 'group-sidebar-navigation' : 'account-sidebar-navigation'}
        data-testid={group ? 'rail-collapse-toggle' : 'app-sidebar-toggle'}
        className={cn('min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary', group ? 'hidden md:grid' : 'grid')}
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
