import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, type LucideIcon } from 'lucide-react'
import { cn } from '../../ui/cn'

export type GroupActionMenuItem = {
  key: string
  label: string
  icon: LucideIcon
  onSelect: () => void
  /** Rendered in the destructive tone (never the only cue: it also has text). */
  danger?: boolean
  separatorBefore?: boolean
}

const MENU_MIN_WIDTH = 208

/**
 * Group-scoped "⋮" row menu (ADR-0074 §4).
 *
 * Renders through a portal with fixed coordinates so a scrollable or
 * `overflow-hidden` ancestor (a table card, a scroll container) cannot clip it,
 * and flips up when there is no room below the trigger.
 *
 * Accessibility: the trigger is a 44px button with `aria-haspopup="menu"`;
 * items are `role="menuitem"` with roving focus (arrows, Home/End, Escape and
 * Tab). Escape and every selection return focus to the trigger.
 */
export function GroupActionMenu({
  label,
  items,
  className,
}: {
  label: string
  items: GroupActionMenuItem[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
    openUp: boolean
  } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Measure the trigger so the portal can be positioned (and flipped).
  useEffect(() => {
    if (!open) return
    function measure() {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom
      const above = rect.top
      const openUp = below < 220 && above > below
      setBox({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: rect.right - Math.max(rect.width, MENU_MIN_WIDTH),
        width: Math.max(rect.width, MENU_MIN_WIDTH),
        maxHeight: Math.max(160, Math.min(320, (openUp ? above : below) - 8)),
        openUp,
      })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open])

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  // A pointer outside the trigger or the menu closes it.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    const index = entries.indexOf(document.activeElement as HTMLElement)
    const go = (next: number) => {
      event.preventDefault()
      entries[(next + entries.length) % entries.length]?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        go(index + 1)
        break
      case 'ArrowUp':
        go(index - 1)
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(entries.length - 1)
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        break
    }
  }

  if (items.length === 0) return null

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && box
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onKeyDown}
              style={{
                position: 'fixed',
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
                transform: box.openUp ? 'translateY(-100%)' : undefined,
              }}
              className="z-[110] overflow-y-auto rounded-xl border border-border-subtle bg-surface p-1 text-ink shadow-xl"
            >
              {items.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.key}>
                    {item.separatorBefore ? <hr className="my-1 border-border-subtle" /> : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close()
                        item.onSelect()
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                        item.danger
                          ? 'text-error-ink hover:bg-error/10'
                          : 'text-ink hover:bg-surface-hover',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </button>
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
