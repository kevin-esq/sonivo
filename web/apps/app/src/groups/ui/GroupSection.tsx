import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../../ui/cn'

export type GroupSectionProps = {
  title?: string
  description?: string
  /** Right-aligned action(s) in the section heading row. */
  action?: ReactNode
  /** `id` for the `<h2>`; auto-generated when omitted. */
  headingId?: string
  children: ReactNode
  className?: string
}

/**
 * Group-scoped section wrapper: consistent heading row (title + optional
 * description + action) and vertical rhythm. Used by every group page so
 * sections look the same and follow the group tokens.
 */
export function GroupSection({
  title,
  description,
  action,
  headingId,
  children,
  className,
}: GroupSectionProps) {
  const autoId = useId()
  const id = headingId ?? autoId
  const hasHeading = Boolean(title || action)
  return (
    <section aria-labelledby={hasHeading ? id : undefined} className={cn('space-y-3', className)}>
      {hasHeading ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            {title ? (
              <h2 id={id} className="font-display text-lg font-semibold text-ink">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-sm text-muted">{description}</p> : null}
          </div>
          {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
