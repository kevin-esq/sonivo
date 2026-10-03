import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary-strong text-primary-foreground shadow-sm hover:bg-primary-strong/90',
        secondary:
          'border border-border-subtle bg-surface text-ink hover:bg-surface-hover',
        outline: 'border-2 border-primary bg-transparent text-primary-ink hover:bg-primary/10',
        ghost: 'bg-transparent text-primary-ink hover:underline',
        danger: 'bg-error-strong text-white hover:bg-error-strong/90',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 px-3',
        lg: 'h-12 px-5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export const primaryButtonClass = buttonVariants({ variant: 'primary' })
export const secondaryButtonClass = buttonVariants({ variant: 'secondary' })
export const dangerButtonClass = buttonVariants({ variant: 'danger' })

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
}
