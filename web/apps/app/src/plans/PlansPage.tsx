import { routes } from '../routing/routes'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, Users } from 'lucide-react'
import { ApiError } from '../api/http'
import { getPaymentProviderStatus, startGroupCheckout, updateGroupPlan, type PaymentProviderStatus } from '../api/billing'
import {
  getGroupUsage,
  getPlanCatalog,
  listMyGroups,
  type GroupSummary,
  type GroupUsage,
  type PlanCatalog,
} from '../api/client'
import { useT } from '../i18n'
import { cn } from '../ui/cn'

/**
 * Plan overview: plan pricing/trials are still provisional, so this page shows
 * current group usage without presenting placeholder commercial offers.
 */
export function PlansPage() {
  const { t, lang } = useT()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [usage, setUsage] = useState<Record<string, GroupUsage>>({})
  const [provider, setProvider] = useState<PaymentProviderStatus | null>(null)
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({})
  const [pendingGroup, setPendingGroup] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const myGroups = await listMyGroups()
        if (cancelled) return
        setGroups(myGroups)
        const [entries, paymentProvider, planCatalog] = await Promise.all([
          Promise.all(myGroups.map(async (group) => {
            try {
              return [group.id, await getGroupUsage(group.id)] as const
            } catch {
              return null
            }
          })),
          getPaymentProviderStatus().catch(() => null),
          getPlanCatalog().catch(() => null),
        ])
        if (cancelled) return
        setUsage(Object.fromEntries(entries.filter((e): e is readonly [string, GroupUsage] => e !== null)))
        setProvider(paymentProvider)
        setCatalog(planCatalog)
      } catch {
        if (!cancelled) setError(t('plans.loadError'))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [t])

  const runPlanAction = async (groupId: string, action: 'assign', planId: string) => {
    setPendingGroup(groupId)
    setActionError(null)
    try {
      await updateGroupPlan(groupId, action, planId)
      const updated = await getGroupUsage(groupId)
      setUsage((current) => ({ ...current, [groupId]: updated }))
    } catch (cause) {
      setActionError(cause instanceof ApiError && cause.status === 409
        ? t('plans.checkoutUnavailable')
        : t('plans.updateError'))
    } finally {
      setPendingGroup(null)
    }
  }

  const beginCheckout = async (groupId: string, planId: string) => {
    setPendingGroup(groupId)
    setActionError(null)
    try {
      const url = await startGroupCheckout(groupId, planId)
      const checkout = new URL(url)
      if (checkout.protocol !== 'https:' && !(checkout.protocol === 'http:' && window.location.hostname === 'localhost')) {
        throw new Error('Unsupported checkout URL protocol.')
      }
      window.location.assign(checkout.href)
    } catch (cause) {
      setActionError(cause instanceof ApiError && cause.status === 409
        ? t('plans.checkoutUnavailable')
        : t('plans.checkoutError'))
      setPendingGroup(null)
    }
  }

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

      <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface p-4" role="status">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden="true" />
        <div className="space-y-1 text-sm leading-6 text-muted">
          <p>{t('plans.billingStatus')}</p>
          {provider ? <p>{t(provider.provider === 'sandbox'
            ? provider.configured ? 'plans.sandboxConfigured' : 'plans.sandboxUnavailable'
            : 'plans.manualProvider')}</p> : null}
        </div>
      </div>

      {actionError ? <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error-ink">{actionError}</p> : null}

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
              const isOwner = group.role.toLowerCase() === 'owner'
              const selected = selectedPlan[group.id] ?? groupUsage?.planId ?? ''
              return (
                <li key={group.id} className="rounded-2xl border border-border-subtle bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to={routes.group(group.id)}
                      className="truncate font-semibold text-ink no-underline hover:underline"
                    >
                      {group.name}
                    </Link>
                    {groupUsage ? (
                      <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold capitalize text-primary-ink">
                        {t('plans.planLabel')}: {planName(groupUsage.planId, t)}
                      </span>
                    ) : null}
                  </div>
                  {groupUsage ? (
                    <>
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                        <UsageRow label={t('plans.members')} metric={groupUsage.members} t={t} />
                        <UsageRow label={t('plans.songs')} metric={groupUsage.songs} t={t} />
                        <UsageRow label={t('plans.setlists')} metric={groupUsage.setlists} t={t} />
                        <UsageRow label={t('plans.events')} metric={groupUsage.eventsThisMonth} t={t} />
                      </dl>
                      <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
                        <dl className="grid gap-1 text-sm sm:grid-cols-2">
                          <div><dt className="inline text-muted">{t('plans.billingState')}: </dt><dd className="inline text-ink">{billingStatusName(groupUsage.billingStatus, t)}</dd></div>
                          {groupUsage.trialEndsAt ? <div><dt className="inline text-muted">{t('plans.trialEnds')}: </dt><dd className="inline text-ink">{formatDate(groupUsage.trialEndsAt, lang)}</dd></div> : null}
                          {groupUsage.scheduledPlanId ? <div><dt className="inline text-muted">{t('plans.scheduledPlan')}: </dt><dd className="inline text-ink">{planName(groupUsage.scheduledPlanId, t)}</dd></div> : null}
                        </dl>
                        {isOwner && catalog ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="grid min-w-44 gap-1 text-xs font-medium text-muted">
                              {t('plans.choosePlan')}
                              <select
                                className="min-h-11 rounded-xl border border-border-subtle bg-surface px-3 text-sm text-ink"
                                value={selected}
                                onChange={(event) => setSelectedPlan((current) => ({ ...current, [group.id]: event.target.value }))}
                                disabled={pendingGroup !== null}
                              >
                                {catalog.plans.map((plan) => <option key={plan.id} value={plan.id}>{planName(plan.id, t)}</option>)}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="min-h-11 rounded-xl border border-border-subtle bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
                              disabled={pendingGroup !== null || selected === groupUsage.planId}
                              onClick={() => void runPlanAction(group.id, 'assign', selected)}
                            >{t('plans.assignPlan')}</button>
                            {provider?.provider === 'sandbox' && provider.configured ? (
                              <button
                                type="button"
                                className="min-h-11 rounded-xl bg-primary-strong px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-strong/90 disabled:opacity-50"
                                disabled={pendingGroup !== null}
                                onClick={() => void beginCheckout(group.id, selected)}
                              >{t('plans.sandboxCheckout')}</button>
                            ) : null}
                          </div>
                        ) : isOwner ? <p className="text-sm text-muted">{t('plans.controlsUnavailable')}</p> : null}
                        <p className="text-xs text-muted">{t(isOwner ? 'plans.ownerControlsHint' : 'plans.readOnlyHint')}</p>
                        {isOwner ? (
                          <Link
                            to={`${routes.group(group.id)}/settings?tab=plan`}
                            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-ink no-underline hover:underline"
                          >{t('plans.groupSettings')}</Link>
                        ) : null}
                      </div>
                    </>
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

function planName(planId: string, t: ReturnType<typeof useT>['t']): string {
  switch (planId) {
    case 'starter':
      return t('plans.name.starter')
    case 'pro':
      return t('plans.name.pro')
    case 'studio':
      return t('plans.name.studio')
    default:
      return t('plans.name.unknown')
  }
}

function billingStatusName(status: string, t: ReturnType<typeof useT>['t']): string {
  switch (status) {
    case 'active': return t('plans.status.active')
    case 'trialing': return t('plans.status.trialing')
    case 'past_due': return t('plans.status.pastDue')
    case 'read_only': return t('plans.status.readOnly')
    default: return t('plans.status.unknown')
  }
}

function formatDate(value: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(value))
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
