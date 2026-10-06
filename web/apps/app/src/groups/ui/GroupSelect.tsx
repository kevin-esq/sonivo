import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../ui/cn'
import { groupFieldClass, groupFieldErrorClass } from './GroupField'

export type GroupSelectOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export type GroupSelectProps = {
  label?: string
  hint?: string
  error?: string | null
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  options: GroupSelectOption[]
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  size?: 'default' | 'sm'
  'aria-label'?: string
}

/**
 * Group-scoped custom select (ADR-0074 §5): a styled listbox that follows the
 * group accent, replacing the native `<select>` inside group creation dialogs.
 *
 * Accessibility follows the ARIA 1.2 combobox/listbox pattern: the trigger is
 * `role="combobox"`, options are `role="option"` with `aria-selected`, and the
 * keyboard supports Enter/Space, Arrow keys, Home/End, Escape, Tab and
 * type-ahead. A hidden input keeps the value available to native forms.
 */
export function GroupSelect({
  label,
  hint,
  error,
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
  className,
  size = 'default',
  'aria-label': ariaLabel,
}: GroupSelectProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const listboxId = `${fieldId}-listbox`
  const errorId = error ? `${fieldId}-error` : undefined
  const hintId = hint ? `${fieldId}-hint` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  )
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function openList() {
    if (disabled) return
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  function commit(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
  }

  function move(delta: number) {
    if (options.length === 0) return
    setActiveIndex((prev) => {
      let next = prev < 0 ? (delta > 0 ? -1 : 0) : prev
      for (let i = 0; i < options.length; i += 1) {
        next = (next + delta + options.length) % options.length
        if (!options[next]?.disabled) break
      }
      return next
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) openList()
        else move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!open) openList()
        else move(-1)
        break
      case 'Home':
        if (open) {
          event.preventDefault()
          setActiveIndex(0)
        }
        break
      case 'End':
        if (open) {
          event.preventDefault()
          setActiveIndex(options.length - 1)
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) commit(activeIndex)
        else openList()
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
        }
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const query = event.key.toLowerCase()
          const start = activeIndex >= 0 ? activeIndex : -1
          for (let i = 1; i <= options.length; i += 1) {
            const index = (start + i) % options.length
            const option = options[index]
            if (option && !option.disabled && option.label.toLowerCase().startsWith(query)) {
              setActiveIndex(index)
              if (!open) setOpen(true)
              break
            }
          }
        }
    }
  }

  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <div ref={rootRef} className={cn('relative', className)}>
        <button
          id={fieldId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${fieldId}-opt-${activeIndex}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-label={ariaLabel}
          aria-required={required || undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
          className={cn(
            groupFieldClass,
            'flex items-center justify-between gap-2 text-left',
            error && groupFieldErrorClass,
            size === 'sm' && 'min-h-9 py-1.5',
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted')}>
            {selected ? selected.label : placeholder ?? ''}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>

        {open ? (
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-labelledby={label ? fieldId : undefined}
            aria-label={label ? undefined : ariaLabel}
            className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border-subtle bg-surface p-1 text-ink shadow-xl"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted" aria-disabled="true">
                {placeholder ?? '—'}
              </li>
            ) : (
              options.map((option, index) => {
                const isSelected = option.value === value
                const isActive = index === activeIndex
                return (
                  <li
                    key={option.value}
                    id={`${fieldId}-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onMouseEnter={() => {
                      if (!option.disabled) setActiveIndex(index)
                    }}
                    onClick={() => commit(index)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors motion-reduce:transition-none',
                      isActive && 'bg-surface-hover',
                      option.disabled && 'cursor-not-allowed opacity-50',
                      isSelected && 'font-semibold text-primary-ink',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.description ? (
                        <span className="block truncate text-xs text-muted">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <Check className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
                    ) : null}
                  </li>
                )
              })
            )}
          </ul>
        ) : null}

        {name ? <input type="hidden" name={name} value={value} /> : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}
