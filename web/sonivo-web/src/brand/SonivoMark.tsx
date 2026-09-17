import { Link } from 'react-router-dom'
import { cn } from '../ui/cn'

export function SonivoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('h-8 w-8 text-primary', className)}
      aria-hidden="true"
    >
      <path d="M6 13v6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M12 7v18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 10v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 14v4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function WaveformHero({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 560 180"
      fill="none"
      className={cn('h-auto w-full', className)}
      aria-hidden="true"
    >
      <path
        d="M0 96c36 0 36-52 72-52s36 104 72 104 36-88 72-88 36 72 72 72 36-96 72-96 36 60 72 60 36-20 72-20 36 20 56 20"
        stroke="url(#sonivo-wave)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="sonivo-wave" x1="0" x2="560" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8366F1" stopOpacity="0.15" />
          <stop offset="0.45" stopColor="#E8C4F6" />
          <stop offset="1" stopColor="#8366F1" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function BrandLockup({
  to,
  light = false,
}: {
  to: string
  light?: boolean
}) {
  return (
    <Link to={to} className="flex items-center gap-2 no-underline">
      <SonivoMark className={light ? 'text-white' : 'text-primary'} />
      <span className={cn('text-lg font-semibold tracking-tight', light ? 'text-white' : 'text-neutral-dark')}>
        Sonivo
      </span>
    </Link>
  )
}
