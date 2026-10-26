import { SonivoMark } from './SonivoMarkIcon'
import { AppLink } from '../routing/AppLink'

export function NextBrandLockup({ to }: { to: string }) {
  return (
    <AppLink mode="next" to={to} className="flex min-h-11 items-center gap-2 no-underline">
      <SonivoMark />
      <span className="text-lg font-semibold tracking-tight text-ink">Sonivo</span>
    </AppLink>
  )
}
