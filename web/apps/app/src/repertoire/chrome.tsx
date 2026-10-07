import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AudioLines,
  BookOpen,
  Disc3,
  FileText,
  Headphones,
  Link2,
  Music2,
  Repeat,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { useT } from '../i18n'
import { formatOriginKind, formatPurpose } from './ui'
import type { ResourcePurpose, ResourceSummary, SongOriginKind } from '../api/client'

export const RESOURCE_PURPOSE_ORDER: ResourcePurpose[] = [
  'chart',
  'lyrics',
  'audio',
  'click',
  'practice',
  'reference',
  'other',
]

const ORIGIN_VISUAL: Record<
  SongOriginKind,
  { Icon: LucideIcon; tileClass: string }
> = {
  original: { Icon: Music2, tileClass: 'bg-primary/15 text-primary-ink' },
  cover: { Icon: Disc3, tileClass: 'bg-accent/20 text-accent' },
  other: { Icon: AudioLines, tileClass: 'bg-secondary text-ink' },
}

const PURPOSE_VISUAL: Record<ResourcePurpose, { Icon: LucideIcon; tileClass: string }> = {
  chart: { Icon: FileText, tileClass: 'bg-primary/15 text-primary-ink' },
  lyrics: { Icon: BookOpen, tileClass: 'bg-secondary text-ink' },
  audio: { Icon: Headphones, tileClass: 'bg-accent/20 text-accent' },
  click: { Icon: Timer, tileClass: 'bg-warning/20 text-ink' },
  practice: { Icon: Repeat, tileClass: 'bg-success/20 text-ink' },
  reference: { Icon: Link2, tileClass: 'bg-surface-hover text-muted' },
  other: { Icon: AudioLines, tileClass: 'bg-surface-hover text-muted' },
}

export function originVisual(kind: string) {
  return ORIGIN_VISUAL[(kind as SongOriginKind)] ?? ORIGIN_VISUAL.other
}

export function purposeVisual(purpose: string) {
  return PURPOSE_VISUAL[(purpose as ResourcePurpose)] ?? PURPOSE_VISUAL.other
}

export function groupResourcesByPurpose(resources: ResourceSummary[]) {
  const buckets = new Map<string, ResourceSummary[]>()
  for (const purpose of RESOURCE_PURPOSE_ORDER) buckets.set(purpose, [])
  for (const resource of resources) {
    const key = RESOURCE_PURPOSE_ORDER.includes(resource.purpose as ResourcePurpose)
      ? resource.purpose
      : 'other'
    buckets.get(key)!.push(resource)
  }
  return RESOURCE_PURPOSE_ORDER.filter((purpose) => (buckets.get(purpose)?.length ?? 0) > 0).map(
    (purpose) => ({ purpose, resources: buckets.get(purpose)! }),
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        {children}
      </label>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>
}

export function PageBreadcrumb({ items }: { items: { to?: string; label: string }[] }) {
  const { t } = useT()
  return (
    <nav aria-label={t('a11y.breadcrumb')} className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.to ? (
              <Link className="inline-flex min-h-11 items-center font-medium text-primary-ink no-underline hover:underline" to={item.to}>
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function EmptyPanel({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl bg-surface-hover px-5 py-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink">
        <Music2 className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="max-w-md text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function OriginMark({ kind }: { kind: string }) {
  const { Icon, tileClass } = originVisual(kind)
  return (
    <span
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
        tileClass,
      )}
      aria-hidden="true"
    >
      <Icon className="h-5 w-5" />
    </span>
  )
}

export function OriginBadge({ kind }: { kind: string }) {
  const { t } = useT()
  return (
    <span className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-xs font-semibold text-muted">
      {formatOriginKind(kind, t)}
    </span>
  )
}

export function PurposeMark({ purpose }: { purpose: string }) {
  const { Icon, tileClass } = purposeVisual(purpose)
  return (
    <span
      className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tileClass)}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4" />
    </span>
  )
}

export function NumberedMark({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-sm font-semibold text-muted">
      {n}
    </span>
  )
}

export function AddSongButton({ onClick }: { onClick: () => void }) {
  const { t } = useT()
  return (
    <Button onClick={onClick}>
      {t('canciones.addSong')}
    </Button>
  )
}

export function PurposeHeading({ purpose }: { purpose: string }) {
  const { t } = useT()
  return (
    <h4 className="flex items-center gap-2 text-sm font-semibold text-muted">
      <PurposeMark purpose={purpose} />
      {formatPurpose(purpose, t)}
    </h4>
  )
}

type ReadinessTone = 'neutral' | 'ok' | 'warn' | 'accent'

const READINESS_TONE_CLASS: Record<ReadinessTone, string> = {
  neutral: 'bg-surface-hover text-muted',
  ok: 'bg-success/20 text-ink',
  warn: 'bg-warning/25 text-ink',
  accent: 'bg-primary/15 text-primary-ink',
}

/** Operate status chip: icon/label pair, never the sole carrier of status (paired with nearby text). */
export function ReadinessChip({
  tone = 'neutral',
  testId,
  children,
}: {
  tone?: ReadinessTone
  testId?: string
  children: ReactNode
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold sm:min-h-0',
        READINESS_TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  )
}
