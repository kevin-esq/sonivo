import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../ui/cn'
import { useT } from '../../i18n'

const SIZE_CLASS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  /** Wide, two-column surfaces (the member profile). */
  xl: 'max-w-4xl',
} as const

const RESPONSIVE_SIZE_CLASS = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Open dialogs, innermost last. Escape, the backdrop and the Tab trap belong to
 * the top-most layer only, so a dialog opened from another one (a confirmation
 * over the member profile) never closes the dialog behind it.
 */
const openLayers: symbol[] = []
let documentOverflowBeforeFirstLayer: string | null = null

function enterLayer(): symbol {
  const layer = Symbol('group-dialog')
  openLayers.push(layer)
  if (openLayers.length === 1) {
    documentOverflowBeforeFirstLayer = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
  return layer
}

function leaveLayer(layer: symbol): void {
  const index = openLayers.indexOf(layer)
  if (index >= 0) openLayers.splice(index, 1)
  if (openLayers.length === 0 && documentOverflowBeforeFirstLayer !== null) {
    document.documentElement.style.overflow = documentOverflowBeforeFirstLayer
    documentOverflowBeforeFirstLayer = null
  }
}

export type GroupDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode | ((requestClose: () => void) => ReactNode)
  footer?: ReactNode | ((requestClose: () => void) => ReactNode)
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  size?: keyof typeof SIZE_CLASS
  pending?: boolean
  testId?: string
  closeLabel?: string
  /** Optional dirty-state guard for workflows that own an editable draft. */
  confirmDiscard?: boolean
  /**
   * Takes the whole viewport on phones (a full-screen sheet) and behaves like a
   * centered dialog from `sm` up. Meant for wide, content-heavy panels such as
   * the member profile, which would otherwise be a ~360px column.
   */
  mobileFullscreen?: boolean
  /** Keeps short workflows compact while allowing long dialog content to scroll. */
  fitContent?: boolean
}

export function GroupDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  onSubmit,
  size = 'md',
  pending,
  testId,
  closeLabel,
  confirmDiscard = false,
  mobileFullscreen = false,
  fitContent = false,
}: GroupDialogProps) {
  const { t } = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const discardCancelRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const layerRef = useRef<symbol | null>(null)
  const titleId = useId()
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const attachAnchor = useCallback((anchor: HTMLSpanElement | null) => {
    if (!anchor) return
    // Escape animated/clipped page containers while retaining group theme tokens.
    setPortalRoot(anchor.closest<HTMLElement>('.group-workspace') ?? document.body)
  }, [])

  useEffect(() => {
    if (!open) return
    layerRef.current = enterLayer()
    return () => {
      if (layerRef.current) leaveLayer(layerRef.current)
      layerRef.current = null
    }
  }, [open])

  const isTopMost = () => layerRef.current !== null && openLayers[openLayers.length - 1] === layerRef.current

  const requestClose = useCallback(() => {
    if (pending) return
    if (confirmDiscard) {
      if (confirmingDiscard) {
        setConfirmingDiscard(false)
        return
      }
      setConfirmingDiscard(true)
      return
    }
    onClose()
  }, [pending, confirmDiscard, confirmingDiscard, onClose])

  useEffect(() => {
    if (!confirmingDiscard) return
    const raf = requestAnimationFrame(() => discardCancelRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [confirmingDiscard])

  // Focus the first field on open and restore focus to the trigger on close.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      const target =
        panel?.querySelector<HTMLElement>('[data-autofocus]') ??
        panel?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select') ??
        panel?.querySelector<HTMLElement>('button')
      ;(target ?? panelRef.current)?.focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // Escape closes; Tab is trapped inside the panel while open. Both only apply
  // to the top-most layer, so a stacked dialog does not close its parent.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (!isTopMost()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, requestClose])

  if (!open) return null

  const body = (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => requestClose()}
          disabled={pending}
          aria-label={closeLabel ?? t('common.close')}
          className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 motion-reduce:transition-none"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className={cn(
        'min-h-0 space-y-4 overflow-y-auto px-5 py-4',
        fitContent ? 'flex-1 sm:max-h-[calc(85dvh-10rem)] sm:flex-none' : 'flex-1',
      )}>
        <div className={confirmingDiscard ? 'hidden' : undefined} aria-hidden={confirmingDiscard}>
          {typeof children === 'function' ? children(requestClose) : children}
        </div>
        {confirmingDiscard ? (
          <div role="group" aria-labelledby={`${titleId}-discard`} className="rounded-xl border border-error/30 bg-error/5 p-4">
            <p id={`${titleId}-discard`} className="font-semibold text-ink">{t('common.unsavedChanges')}</p>
            <p className="mt-1 text-sm text-muted">{t('common.discardChanges')}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button ref={discardCancelRef} type="button" onClick={() => { setConfirmingDiscard(false); closeButtonRef.current?.focus() }} className="min-h-11 rounded-xl border border-border-subtle px-4 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t('common.cancel')}</button>
              <button type="button" onClick={() => { setConfirmingDiscard(false); onClose() }} className="min-h-11 rounded-xl bg-error-strong px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error">{t('common.discard')}</button>
            </div>
          </div>
        ) : null}
      </div>
      {footer && !confirmingDiscard ? (
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border-subtle px-5 py-4">
          {typeof footer === 'function' ? footer(requestClose) : footer}
        </footer>
      ) : null}
    </>
  )

  const overlay = (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex justify-center overflow-y-auto overscroll-contain bg-neutral-dark/60',
        // A "sheet" owns the whole viewport on phones (where a 6xl panel would
        // still be ~360px wide and cramp its content) and becomes a centered
        // dialog from `sm` upwards.
        mobileFullscreen
          ? 'items-stretch p-0 sm:items-center sm:p-4 sm:py-10'
          : 'items-start p-4 py-10 sm:items-center',
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && isTopMost()) requestClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className={cn(
          'relative w-full border-border-subtle bg-surface text-ink shadow-2xl outline-none',
          mobileFullscreen
            ? 'h-[100dvh] rounded-none border-0 sm:h-auto sm:max-h-[85dvh] sm:rounded-2xl sm:border ' +
                RESPONSIVE_SIZE_CLASS[size]
            : 'rounded-2xl border ' + SIZE_CLASS[size],
        )}
      >
        <div className={cn('flex flex-col', mobileFullscreen ? 'h-[100dvh] sm:h-auto sm:max-h-[85dvh]' : 'max-h-[85dvh]')}>
          {onSubmit ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                onSubmit(event)
              }}
              className="flex min-h-0 flex-1 flex-col"
              noValidate
            >
              {body}
            </form>
          ) : (
            body
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <span ref={attachAnchor} hidden />
      {portalRoot ? createPortal(overlay, portalRoot) : null}
    </>
  )
}
