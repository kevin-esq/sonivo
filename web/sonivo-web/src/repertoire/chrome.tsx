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
  original: { Icon: Music2, tileClass: 'bg-primary/15 text-primary' },
  cover: { Icon: Disc3, tileClass: 'bg-accent/20 text-accent' },
  other: { Icon: AudioLines, tileClass: 'bg-secondary text-neutral-dark' },
}

const PURPOSE_VISUAL: Record<ResourcePurpose, { Icon: LucideIcon; tileClass: string }> = {
  chart: { Icon: FileText, tileClass: 'bg-primary/15 text-primary' },
  lyrics: { Icon: BookOpen, tileClass: 'bg-secondary text-neutral-dark' },
  audio: { Icon: Headphones, tileClass: 'bg-accent/20 text-accent' },
  click: { Icon: Timer, tileClass: 'bg-warning/20 text-neutral-dark' },
  practice: { Icon: Repeat, tileClass: 'bg-success/20 text-neutral-dark' },
  reference: { Icon: Link2, tileClass: 'bg-slate-100 text-slate-600' },
  other: { Icon: AudioLines, tileClass: 'bg-slate-100 text-slate-600' },
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
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {children}
      </label>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>
}

export function PageBreadcrumb({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav aria-label="Ruta" className="text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.to ? (
              <Link className="font-medium text-primary no-underline hover:underline" to={item.to}>
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
    <div className="flex flex-col items-start gap-4 rounded-2xl bg-neutral-light px-5 py-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Music2 className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="font-semibold text-neutral-dark">{title}</p>
        <p className="max-w-md text-sm text-slate-500">{description}</p>
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
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-light px-2.5 py-0.5 text-xs font-semibold text-slate-600">
      {formatOriginKind(kind)}
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
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-light text-sm font-semibold text-slate-600">
      {n}
    </span>
  )
}

export function AddSongButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      Agregar canción
    </Button>
  )
}

export function PurposeHeading({ purpose }: { purpose: string }) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-600">
      <PurposeMark purpose={purpose} />
      {formatPurpose(purpose)}
    </h4>
  )
}
