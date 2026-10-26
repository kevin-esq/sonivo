import { SonivoMark } from './SonivoMarkIcon'
import { cn } from '../ui/cn'
import { AppLink } from '../routing/AppLink'

export function BrandLockup({
  to,
  light = false,
  shell = false,
}: {
  to: string
  light?: boolean
  shell?: boolean
}) {
  return (
    <AppLink to={to} className="flex min-h-11 items-center gap-2 no-underline">
      <SonivoMark className={light ? 'text-white' : 'text-shell-link'} />
      <span
        className={cn(
          'text-lg font-semibold tracking-tight',
          light ? 'text-white' : shell ? 'text-shell-foreground' : 'text-ink',
        )}
      >
        Sonivo
      </span>
    </AppLink>
  )
}
