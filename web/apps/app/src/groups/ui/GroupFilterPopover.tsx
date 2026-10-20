import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useT } from '../../i18n'
import { cn } from '../../ui/cn'

/** Compact filters share dismissal, motion and positioning without changing toolbar layout. */
export function GroupFilterPopover({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  return (
    <div ref={wrapper} className="relative ml-auto shrink-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          wrapper.current?.querySelector('button')?.focus()
        }
      }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        {t('tasks.filters')}{count > 0 ? ` (${count})` : ''}
      </button>
      <div id={panelId} inert={!open} aria-hidden={!open} className={cn(
        'absolute right-0 top-full z-50 mt-2 grid max-h-[min(28rem,60dvh)] w-[min(18rem,calc(100vw-3rem))] gap-3 overflow-y-auto rounded-xl border border-border-subtle bg-surface p-3 text-left shadow-lg transition-[opacity,transform,visibility] duration-150 ease-out motion-reduce:transition-none motion-reduce:transform-none',
        open ? 'visible translate-y-0 opacity-100' : 'invisible pointer-events-none -translate-y-1 opacity-0',
      )}>{children}</div>
    </div>
  )
}
