import { useEffect, useRef } from 'react'
import { LogOut, Menu } from 'lucide-react'
import { useT } from '../i18n'
import { AppNavLink } from '../routing/AppLink'
import type { MobileSectionItem } from './MobileSectionNav'

export function MobileMoreMenu({ items, onLogout }: { items: MobileSectionItem[]; onLogout?: () => void }) {
  const { t } = useT()
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  return (
    <details ref={ref} className="relative" data-testid="mobile-more" onKeyDown={(event) => {
      if (event.key === 'Escape' && ref.current) {
        ref.current.open = false
        ref.current.querySelector('summary')?.focus()
      }
    }}>
      <summary aria-label={t('workspace.more')} className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-shell-border px-3 text-sm font-medium text-shell-foreground/80 hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden">
        <Menu className="h-4 w-4" aria-hidden="true" />
        {t('workspace.more')}
      </summary>
      <nav aria-label={t('workspace.more')} className="absolute right-0 top-full z-50 mt-2 max-h-[65dvh] w-56 overflow-y-auto rounded-2xl border border-shell-border bg-surface p-1 text-ink shadow-xl">
        {items.map((item) => (
          <AppNavLink key={item.id} to={item.to} end={item.end} onClick={() => { if (ref.current) ref.current.open = false }} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium no-underline hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <item.icon className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {item.label}
          </AppNavLink>
        ))}
        {onLogout ? (
          <button type="button" onClick={() => { if (ref.current) ref.current.open = false; onLogout() }} className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl border-t border-shell-border px-3 text-sm font-medium text-error-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t('chrome.logout')}
          </button>
        ) : null}
      </nav>
    </details>
  )
}
