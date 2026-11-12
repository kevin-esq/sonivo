'use client'

import { routes } from '../routing/routes'
import { useEffect, useState } from 'react'
import { Info, Users } from 'lucide-react'
import { ApiError } from '../api/http'
import { getBillingOrganizations, getPaymentProviderStatus, startAccountTrial, startGroupCheckout, updateGroupPlan, type BillingSummary, type PaymentProviderStatus } from '../api/billing'
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
import { AppLink } from '../routing/AppLink'
import { BillingPanel } from './BillingPanel'

/**
 * Plan overview with the active provider, Group usage and owner billing actions.
 */
export function PlansPage({ navigationMode = 'legacy', embedded = false }: { navigationMode?: 'legacy' | 'next'; embedded?: boolean } = {}) {
  const { t, lang } = useT()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [usage, setUsage] = useState<Record<string, GroupUsage>>({})
  const [provider, setProvider] = useState<PaymentProviderStatus | null>(null)
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null)
  const [billingAccounts, setBillingAccounts] = useState<{ groupId: string | null; summary: BillingSummary }[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({})
  const [pendingGroup, setPendingGroup] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [billingDataFailed, setBillingDataFailed] = useState(false)
  const [billingAccountsLoaded, setBillingAccountsLoaded] = useState(false)
  const [trialPending, setTrialPending] = useState(false)
  const [trialError, setTrialError] = useState(false)

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
        setBillingDataFailed(paymentProvider === null || planCatalog === null)
        if (paymentProvider?.provider === 'stripe') {
          try {
            const summaries = await getBillingOrganizations()
            const accounts = summaries.map(summary => ({
              groupId: summary.groupIds.find(id => myGroups.some(group => group.id === id && group.role.toLowerCase() === 'owner')) ?? null,
              summary,
            }))
            if (!cancelled) { setBillingAccounts(accounts); setBillingAccountsLoaded(true) }
          } catch {
            if (!cancelled) { setBillingDataFailed(true); setBillingAccountsLoaded(true) }
          }
        }
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

  const startTrial = async () => {
    setTrialPending(true)
    setTrialError(false)
    try {
      const summary = await startAccountTrial('pro')
      const groupId = summary.groupIds.find(id => groups?.some(group => group.id === id && group.role.toLowerCase() === 'owner')) ?? null
      setBillingAccounts(current => [...current.filter(account => account.summary.organizationId !== summary.organizationId), { groupId, summary }])
    } catch {
      setTrialError(true)
    } finally {
      setTrialPending(false)
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        {!embedded ? <header className="space-y-1.5">
          <h1 className="sonivo-page-title text-ink">{t('plans.title')}</h1>
          <p className="text-muted">{t('plans.subtitle')}</p>
        </header> : null}
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error-ink">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-8'}>
      {!embedded ? <header className="space-y-1.5">
        <h1 className="sonivo-page-title text-ink">{t('plans.title')}</h1>
        <p className="max-w-2xl text-muted">{t('plans.subtitle')}</p>
      </header> : null}

      {!embedded ? <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface p-4" role="status">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden="true" />
        <div className="space-y-1 text-sm leading-6 text-muted">
          <p>{t(provider?.provider === 'stripe' ? 'billing.billingStatus' : 'plans.billingStatus')}</p>
          {provider ? <p>{t(provider.provider === 'stripe'
            ? provider.configured ? 'billing.provider' : 'billing.unavailable'
            : provider.provider === 'sandbox'
              ? provider.configured ? 'plans.sandboxConfigured' : 'plans.sandboxUnavailable'
              : 'plans.manualProvider')}</p> : null}
        </div>
      </div> : null}

      {actionError ? <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error-ink">{actionError}</p> : null}
      {billingDataFailed ? <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error-ink">{t('plans.loadError')}</p> : null}

      {provider?.provider === 'stripe' && catalog && groups ? (
        <section aria-label={t('billing.accountTitle')} className="space-y-3">
          {!embedded ? <div className="space-y-1">
            <h2 className="text-xl font-semibold text-ink">{t('billing.accountTitle')}</h2>
            <p className="text-sm text-muted">{t('billing.accountSubtitle')}</p>
          </div> : null}
          {!billingAccountsLoaded ? <p role="status" className="text-sm text-muted">{t('plans.loading')}</p>
          : billingDataFailed ? null
          : billingAccounts.length > 0 ? billingAccounts.map(({ groupId, summary }) => (
            <div key={summary.organizationId} className={embedded ? 'space-y-5' : 'space-y-5 rounded-2xl border border-border-subtle bg-surface p-4'}>
              {!embedded ? <p className="text-sm font-medium text-ink">{summary.groupIds.map(id => groups.find(group => group.id === id)?.name).filter(Boolean).join(', ')}</p> : null}
              {groupId ? <BillingPanel groupId={groupId} groups={groups} catalog={catalog} usage={usage} initialSummary={summary} configured={provider.configured} /> : <AccountTrialCard summary={summary} mode={navigationMode} lang={lang} pending={trialPending} error={trialError} onStart={() => void startTrial()} t={t} />}
            </div>
          )) : groups.length === 0 || !billingAccounts.some(account => account.groupId) ? <AccountTrialCard summary={null} mode={navigationMode} lang={lang} pending={trialPending} error={trialError} onStart={() => void startTrial()} t={t} /> : <p className="text-sm text-muted">{t('billing.noOwnerGroups')}</p>}
        </section>
      ) : null}

      {!embedded ? <section aria-labelledby="plans-groups-heading" className="space-y-3">
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
                    <AppLink
                      mode={navigationMode}
                      to={routes.group(group.id)}
                      className="truncate font-semibold text-ink no-underline hover:underline"
                    >
                      {group.name}
                    </AppLink>
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
                        {provider && provider.provider !== 'stripe' && isOwner && catalog ? (
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
                        ) : isOwner && provider && provider.provider !== 'stripe' ? <p className="text-sm text-muted">{t('plans.controlsUnavailable')}</p> : null}
                        {provider && provider.provider !== 'stripe' ? <p className="text-xs text-muted">{t(isOwner ? 'plans.ownerControlsHint' : 'plans.readOnlyHint')}</p> : null}
                        {isOwner ? (
                          <AppLink
                            mode={navigationMode}
                            to={`${routes.group(group.id)}/settings?tab=plan`}
                            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-ink no-underline hover:underline"
                          >{t('plans.groupSettings')}</AppLink>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section> : null}
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

function AccountTrialCard({ summary, mode, lang, pending, error, onStart, t }: {
  summary: BillingSummary | null
  mode: 'legacy' | 'next'
  lang: string
  pending: boolean
  error: boolean
  onStart: () => void
  t: ReturnType<typeof useT>['t']
}) {
  const canCreate = summary?.canCreate === true
  const canStartTrial = summary?.canStartTrial ?? true
  const heading = summary?.status === 'trialing' || canCreate
    ? t('billing.activePlan', { plan: planName(summary?.planId ?? 'pro', t) })
    : canStartTrial ? t('billing.trialAccountTitle') : t('billing.noActivePlan')
  const description = summary?.status === 'trialing'
    ? t('billing.trialEnd', { date: summary.trialEndsAt ? formatDate(summary.trialEndsAt, lang) : '' })
    : canCreate ? t('billing.enabled')
      : canStartTrial ? t('billing.trialAccountDescription') : t('billing.activePlanRequired')
  return <section className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-5" aria-labelledby="billing-first-group-title">
    <div className="space-y-1">
      <h3 id="billing-first-group-title" className="text-lg font-semibold text-ink">{heading}</h3>
      <p className="max-w-2xl text-sm leading-6 text-muted">{description}</p>
      {summary?.status === 'trialing' ? <p className="text-sm text-muted">{t('billing.trialNoAutoCharge')}</p> : null}
    </div>
    {error ? <p role="alert" className="text-sm text-error-ink">{t('billing.error')}</p> : null}
    {canCreate
      ? <AppLink mode={mode} to={`${routes.groups}?create=1`} className="inline-flex min-h-11 items-center rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t('billing.createFirstGroup')}</AppLink>
      : canStartTrial
        ? <button type="button" disabled={pending} onClick={onStart} className="inline-flex min-h-11 items-center rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t(pending ? 'billing.trialStarting' : 'billing.startBandaTrial')}</button>
        : <AppLink mode={mode} to={routes.join} className="inline-flex min-h-11 items-center rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t('billing.joinExistingGroup')}</AppLink>}
  </section>
}

function billingStatusName(status: string, t: ReturnType<typeof useT>['t']): string {
  switch (status) {
    case 'active': return t('plans.status.active')
    case 'trialing': return t('plans.status.trialing')
    case 'past_due': return t('plans.status.pastDue')
    case 'inactive': return t('billing.status.inactive')
    case 'legacy': return t('billing.status.legacy')
    case 'canceled': return t('billing.status.canceled')
    case 'unpaid': return t('billing.status.unpaid')
    case 'paused': return t('billing.status.paused')
    case 'temporary_grant': return t('billing.status.temporaryGrant')
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
          {metric.limit === null ? ` · ${t('plans.unlimited')}` : ` / ${metric.limit} · ${t('plans.remainingCount', { count: Math.max(0, metric.limit - metric.used) })}`}
        </dd>
      </div>
      {metric.limit !== null ? (
        <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={metric.limit} aria-valuenow={Math.min(metric.used, metric.limit)} className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
          <div className={cn('h-full rounded-full', near ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      ) : null}
    </div>
  )
}
