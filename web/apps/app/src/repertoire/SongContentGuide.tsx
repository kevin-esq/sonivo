import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { CircleHelp } from 'lucide-react'
import { useT } from '../i18n'

/** Reveals a short explanation of a song version on hover, focus, or activation. */
export function SongContentGuide() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const helpId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!pinned) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setPinned(false)
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pinned])

  function closeTransient(event?: FocusEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) {
    const root = rootRef.current
    const activeElement = document.activeElement
    if (pinned || (root && activeElement && root.contains(activeElement))) return
    if (event && 'relatedTarget' in event && root?.contains(event.relatedTarget as Node | null)) return
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setPinned(false)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div
      ref={rootRef}
      className="relative z-20 shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => closeTransient(event)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => closeTransient(event)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('song.arrangementHelpTitle')}
        aria-describedby={open ? helpId : undefined}
        aria-expanded={open}
        aria-controls={open ? helpId : undefined}
        onClick={() => {
          const nextOpen = !pinned
          setPinned(nextOpen)
          setOpen(nextOpen)
        }}
        onKeyDown={onKeyDown}
        className="grid h-11 w-11 cursor-help place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
      >
        <CircleHelp className="h-5 w-5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={helpId}
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border-subtle bg-surface px-4 py-3 text-left text-sm leading-relaxed text-muted shadow-xl"
        >
          <span className="font-semibold text-ink">{t('song.arrangementHelpTitle')}</span>
          <p className="mt-1">{t('workflow.contentGuide')}</p>
        </div>
      ) : null}
    </div>
  )
}
