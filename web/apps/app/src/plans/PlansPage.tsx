import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CreditCard, Sparkles, Users } from 'lucide-react'
import {
  getGroupUsage,
  getPlanCatalog,
  listMyGroups,
  problemDetail,
  type GroupSummary,
  type GroupUsage,
  type PlanCatalog,
} from '../api/client'
import { useT } from '../i18n'
import { cn } from '../ui/cn'

function planPrice(priceMonthlyMxn: number): string | null {
  return priceMonthlyMxn > 0 ? String(priceMonthlyMxn) : null
}

/**
 * Plans page (`/plan`): the real plan catalog from the API plus the plan and live
 * usage of every group the user belongs to. Replaces the previous placeholder.
 */
export function PlansPage() {
  const { t } = useT()
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null)
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [usage, setUsage] = useState<Record<string, GroupUsage>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [planCatalog, myGroups] = await Promise.all([getPlanCatalog(), listMyGroups()])
        if (cancelled) return
        setCatalog(planCatalog)
        setGroups(myGroups)
        const entries = await Promise.all(
          myGroups.map(async (group) => {
            try {
              return [group.id, await getGroupUsage(group.id)] as const
            } catch {
              return null
            }
          }),
        )
        if (cancelled) return
        setUsage(Object.fromEntries(entries.filter((e): e is readonly [string, GroupUsage] => e !== null)))
      } catch (err) {
        if (!cancelled) setError(problemDetail(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="space-y-4">
        <header className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t('plans.title')}</h1>
          <p className="text-muted">{t('plans.subtitle')}</p>
        </header>
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error-ink">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t('plans.title')}</h1>
        <p className="max-w-2xl text-muted">{t('plans.subtitle')}</p>
      </header>

      {catalog === null ? (
        <p aria-live="polite" className="text-sm text-muted">
          {t('plans.loading')}
        </p>
      ) : catalog.plans.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-muted">
          {t('plans.empty')}
        </p>
      ) : (
        <section aria-labelledby="plans-catalog-heading" className="space-y-3">
          <h2 id="plans-catalog-heading" className="text-xl font-semibold text-ink">
            {t('plans.catalogTitle')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {catalog.plans.map((plan) => {
              const price = planPrice(plan.priceMonthlyMxn)
              const recommended = plan.id === catalog.defaultPlanId
              return (
                <article
                  key={plan.id}
                  className={cn(
                    'flex flex-col rounded-2xl border p-5',
                    recommended ? 'border-primary bg-primary/5' : 'border-border-subtle bg-surface',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold capitalize text-ink">{plan.id}</h3>
                    {recommended ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-ink">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        {t('plans.recommended')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-display text-3xl font-bold text-ink">
                    {price ? t('plans.perMonth', { price }) : t('plans.free')}
                  </p>
                  {plan.trialDays > 0 ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Check className="h-3.5 w-3.5 text-success-strong" aria-hidden="true" />
                      {plan.trialRequiresCard ? t('plans.trialCard', { days: plan.trialDays }) : t('plans.trialNoCard', { days: plan.trialDays })}
                    </p>
                  ) : null}
                  <Link
                    to="/cuenta/membresia"
                    className={cn(
                      'mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold no-underline',
                      recommended
                        ? 'bg-primary-strong text-primary-foreground hover:bg-primary-strong/90'
                        : 'border border-border-subtle text-ink hover:bg-surface-hover',
                    )}
                  >
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                    {t('plans.choose')}
                  </Link>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="plans-groups-heading" className="space-y-3">
        <div className="space-y-1">
          <h2 id="plans-groups-heading" className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Users className="h-5 w-5 text-primary-ink" aria-hidden="true" />
            {t('plans.groupsTitle')}
          </h2>
          <p className="text-sm text-muted">{t('plans.groupsSubtitle')}</p>
        </div>

        {groups === null ? (
          <p aria-live="polite" className="text-sm text-muted">
            {t('plans.loading')}
          </p>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-muted">
            {t('plans.noGroups')}
          </p>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => {
              const groupUsage = usage[group.id]
              return (
                <li key={group.id} className="rounded-2xl border border-border-subtle bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to={`/groups/${group.id}`}
                      className="truncate font-semibold text-ink no-underline hover:underline"
                    >
                      {group.name}
                    </Link>
                    {groupUsage ? (
                      <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold capitalize text-primary-ink">
                        {t('plans.planLabel')}: {groupUsage.planId}
                      </span>
                    ) : null}
                  </div>
                  {groupUsage ? (
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      <UsageRow label={t('plans.members')} metric={groupUsage.members} t={t} />
                      <UsageRow label={t('plans.songs')} metric={groupUsage.songs} t={t} />
                      <UsageRow label={t('plans.setlists')} metric={groupUsage.setlists} t={t} />
                      <UsageRow label={t('plans.events')} metric={groupUsage.eventsThisMonth} t={t} />
                    </dl>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function UsageRow({
  label,
  metric,
  t,
}: {
  label: string
  metric: { used: number; limit: number | null }
  t: ReturnType<typeof useT>['t']
}) {
  const ratio = metric.limit && metric.limit > 0 ? Math.min(1, metric.used / metric.limit) : 0
  const near = metric.limit !== null && metric.limit > 0 && metric.used / metric.limit >= 0.8
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <dt className="text-muted">{label}</dt>
        <dd className="tabular-nums text-ink">
          {metric.used}
          {metric.limit === null ? ` · ${t('plans.unlimited')}` : ` / ${metric.limit}`}
        </dd>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
        <div
          className={cn('h-full rounded-full', near ? 'bg-warning' : 'bg-primary')}
          style={{ width: metric.limit === null ? '100%' : `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}
