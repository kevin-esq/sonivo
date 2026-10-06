import type { ButtonHTMLAttributes, ComponentProps } from 'react'
import { Link } from 'react-router-dom'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../ui/cn'

/**
 * Group-scoped button/link primitives (ADR-0074 §4).
 *
 * These read the semantic tokens the group shell repaints (`primary-strong`,
 * `primary-ink`, `surface`, `border-subtle`…) so every control follows the
 * group accent live — including the branding editor's unsaved preview. They
 * are intentionally separate from `ui/button` (the account/panel stays
 * Sonivo-fixed) and never imported outside a group route.
 */
export const groupButtonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-strong text-primary-foreground shadow-sm hover:bg-primary-strong/90',
        secondary:
          'border border-border-subtle bg-surface text-ink hover:border-primary/30 hover:bg-surface-hover',
        soft: 'bg-primary/12 text-primary-ink hover:bg-primary/20',
        ghost: 'bg-transparent text-primary-ink hover:bg-primary/10',
        danger: 'bg-error-strong text-white hover:bg-error-strong/90',
      },
      size: {
        sm: 'h-9 px-3',
        default: 'h-11 px-4',
        lg: 'h-12 px-5',
        icon: 'h-11 w-11 px-0',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export const groupPrimaryButtonClass = groupButtonVariants({ variant: 'primary' })
export const groupSecondaryButtonClass = groupButtonVariants({ variant: 'secondary' })
export const groupSoftButtonClass = groupButtonVariants({ variant: 'soft' })
export const groupGhostButtonClass = groupButtonVariants({ variant: 'ghost' })
export const groupDangerButtonClass = groupButtonVariants({ variant: 'danger' })

type GroupButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof groupButtonVariants>

export function GroupButton({
  className,
  variant,
  size,
  block,
  type = 'button',
  ...props
}: GroupButtonProps) {
  return (
    <button
      type={type}
      className={cn(groupButtonVariants({ variant, size, block }), className)}
      {...props}
    />
  )
}

type GroupLinkProps = ComponentProps<typeof Link> & VariantProps<typeof groupButtonVariants>

/** Router link styled as a group button (keeps `min-h-11` tap targets). */
export function GroupLink({ className, variant, size, block, ...props }: GroupLinkProps) {
  return (
    <Link className={cn(groupButtonVariants({ variant, size, block }), className)} {...props} />
  )
}
