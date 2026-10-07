import { ArrowUpRight, Gauge } from 'lucide-react'
import { cn } from '../../ui/cn'
import { useT } from '../../i18n'
import { GroupLink } from './GroupButton'
import type { UsageMetric } from '../../api/client'

/** Soft notice threshold (PHASE-PLANS-SPEC §4.1: 80% warning). */
const WARN_RATIO = 0.8

export function limitReached(metric: UsageMetric | undefined): boolean {
  return Boolean(metric && metric.limit != null && metric.used >= metric.limit)
}

export type GroupLimitNoticeProps = {
  /** Localized plural noun already resolved by the caller (e.g. t('plan.labelSongs')). */
  label: string
  metric: UsageMetric | undefined
  /** Where the upgrade CTA goes (group settings → Plan tab). */
  upgradeHref: string
  className?: string
}

/**
 * Plan-limit notice (ADR-0071, PHASE-PLANS-SPEC §4.1). Renders nothing below
 * 80%, a soft warning from 80%, and an upgrade card at 100%. The server also
 * enforces the limit (403), so this is UX only; existing content is never blocked.
 */
export function GroupLimitNotice({ label, metric, upgradeHref, className }: GroupLimitNoticeProps) {
  const { t } = useT()
  if (!metric || metric.limit == null || metric.limit <= 0) return null
  const { used, limit } = metric
  if (used / limit < WARN_RATIO) return null

  if (used >= limit) {
    return (
      <div
        role="status"
        className={cn(
          'flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden="true" />
          <p className="font-semibold text-ink">{t('plan.limitReached', { label })}</p>
        </div>
        <p className="text-sm text-muted">{t('plan.limitReachedBody', { used, limit })}</p>
        <GroupLink to={upgradeHref} variant="primary" className="self-start">
          {t('plan.upgrade')}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </GroupLink>
      </div>
    )
  }

  return (
    <p
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink',
        className,
      )}
    >
      <Gauge className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <span>{t('plan.nearLimit', { used, limit, label })}</span>
    </p>
  )
}
