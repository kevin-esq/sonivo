import { Check, Crown, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { confirmBillingPaymentMethod, createBillingPaymentMethodSetup, getBillingHistory, getBillingPaymentMethod,
  type BillingHistoryEntry, type BillingPaymentMethod, type PaymentMethodSetup } from '../api/billing'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/dialog'
import type { BillingSummary } from '../api/billing'
import type { GroupSummary, GroupUsage, PlanCatalog, UsageMetric } from '../api/client'
import { useBilling } from './useBilling'
import { ReferralPanel } from './ReferralPanel'
import { PaymentMethodEditor } from './PaymentMethodEditor'
import { PlanSelectionDialog } from './PlanSelectionDialog'

export function BillingPanel({ groupId, groups, catalog, usage, initialSummary, configured }: { groupId: string; groups: GroupSummary[]; catalog: PlanCatalog; usage: Record<string, GroupUsage>; initialSummary?: BillingSummary; configured: boolean }) {
  const { t, lang } = useT()
  const billing = useBilling(groupId, initialSummary)
  const [confirmation, setConfirmation] = useState<'cancel' | null>(null)
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [planStep, setPlanStep] = useState<'plans' | 'checkout' | 'change' | 'trial'>('plans')
  const [targetId, setTargetId] = useState('')
  const [history, setHistory] = useState<BillingHistoryEntry[] | null>(null)
  const [historyFailed, setHistoryFailed] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<BillingPaymentMethod | null>(null)
  const [paymentMethodLoaded, setPaymentMethodLoaded] = useState(false)
  const [paymentSetup, setPaymentSetup] = useState<PaymentMethodSetup | null>(null)
  const [paymentMethodPending, setPaymentMethodPending] = useState(false)
  const [paymentMethodFailed, setPaymentMethodFailed] = useState(false)
  const [paymentMethodSaved, setPaymentMethodSaved] = useState(false)
  const [membershipTab, setMembershipTab] = useState<'summary' | 'limits' | 'billing'>('summary')
  useEffect(() => {
    let active = true
    void (initialSummary?.organizationId ? getBillingHistory(initialSummary.organizationId) : Promise.resolve([])).then((items) => { if (active) setHistory(items) }).catch(() => { if (active) setHistoryFailed(true) })
    return () => { active = false }
  }, [initialSummary?.organizationId])
  useEffect(() => {
    let active = true
    const canEditPaymentMethod = configured && initialSummary?.canManage
      && initialSummary.hasSubscription && ['active', 'past_due', 'unpaid'].includes(initialSummary.status)
    setPaymentMethod(null)
    setPaymentMethodFailed(false)
    setPaymentMethodSaved(false)
    if (!canEditPaymentMethod) {
      setPaymentMethod(null)
      setPaymentMethodLoaded(true)
      return () => { active = false }
    }
    setPaymentMethodLoaded(false)
    void getBillingPaymentMethod(groupId).then((value) => {
      if (active) setPaymentMethod(value)
    }).catch(() => {
      if (active) setPaymentMethodFailed(true)
    }).finally(() => {
      if (active) setPaymentMethodLoaded(true)
    })
    return () => { active = false }
  }, [configured, groupId, initialSummary?.canManage, initialSummary?.hasSubscription, initialSummary?.status])
  const { summary, selection, quote, pending } = billing
  const canEditPaymentMethod = configured && summary?.canManage && summary.hasSubscription
    && ['active', 'past_due', 'unpaid'].includes(summary.status)
  async function startPaymentMethodSetup() {
    setPaymentMethodPending(true)
    setPaymentMethodFailed(false)
    setPaymentMethodSaved(false)
    try { setPaymentSetup(await createBillingPaymentMethodSetup(groupId)) }
    catch { setPaymentMethodFailed(true) }
    finally { setPaymentMethodPending(false) }
  }
  async function confirmPaymentMethod(setupIntentId: string, operationId: string) {
    const saved = await confirmBillingPaymentMethod(groupId, setupIntentId, operationId)
    setPaymentMethod(saved)
    setPaymentSetup(null)
    setPaymentMethodFailed(false)
    setPaymentMethodSaved(true)
  }
  const money = (amount: number) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount)
  if (!summary) return <div role="status" className="flex flex-wrap items-center gap-3">{t(billing.failed ? 'billing.error' : 'plans.loading')}<Button variant="secondary" onClick={() => void billing.retry()}>{t('billing.refresh')}</Button></div>

  const planActive = summary.hasSubscription || summary.status === 'trialing' || summary.status === 'temporary_grant' || summary.legacyAccess
  const currentPlan = catalog.plans.find(value => value.id === summary.planId)
  const currentPlanName = t(`plans.name.${summary.planId === 'pro' || summary.planId === 'studio' ? summary.planId : 'starter'}`)
  const currentGroupLimit = typeof currentPlan?.limits.groups === 'number' ? currentPlan.limits.groups : 1
  const groupCapacity = currentGroupLimit + (summary.planId === 'studio' ? summary.extraGroups : 0)
  const linkedCount = summary.groupIds.length
  const remainingGroups = Math.max(0, groupCapacity - linkedCount)

  return <div className="space-y-6">
    <section aria-labelledby="account-plan-status" className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-ink">
            {planActive ? <Crown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {billingStatusLabel(summary.status, t)}
          </span>
          <h2 id="account-plan-status" className="text-3xl font-semibold tracking-tight text-ink">
            {planActive ? t('billing.activePlan', { plan: currentPlanName }) : t('billing.noActivePlan')}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted">{t(summary.legacyAccess ? 'billing.legacy' : summary.canCreate ? 'billing.enabled' : 'billing.restricted')}</p>
          {summary.hasSubscription && currentPlan ? <p className="text-lg font-semibold tabular-nums text-ink">{money(currentPlan.priceMonthlyMxn)} <span className="text-sm font-normal text-muted">{t('billing.perMonth')}</span></p> : null}
        </div>
        {summary.canManage ? <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { setMembershipTab('summary'); setPlanStep('plans'); setPlanDialogOpen(true) }}>{t(summary.hasSubscription ? 'billing.changePlan' : 'billing.explorePlans')}</Button>
          {summary.hasSubscription && summary.status !== 'trialing' ? <Button variant="secondary" disabled={pending} onClick={() => setConfirmation('cancel')}>{t(summary.cancelAtPeriodEnd ? 'billing.resume' : 'billing.cancel')}</Button> : null}
        </div> : null}
      </div>
      <div className="mt-6 grid gap-5 border-t border-border-subtle pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-muted"><Users className="h-4 w-4" aria-hidden="true" />{t('billing.groups')}</span>
            <span className="font-medium tabular-nums text-ink">{t('billing.groupCount', { used: linkedCount, limit: groupCapacity })}</span>
          </div>
          <div
            role="progressbar"
            aria-label={t('billing.groups')}
            aria-valuemin={0}
            aria-valuemax={groupCapacity}
            aria-valuenow={Math.min(linkedCount, groupCapacity)}
            className="h-2 overflow-hidden rounded-full bg-surface-hover"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, groupCapacity > 0 ? linkedCount / groupCapacity * 100 : 0)}%` }} />
          </div>
          <p className="text-xs text-muted">{t('billing.groupsRemaining', { count: remainingGroups })}</p>
        </div>
        <div className="text-sm text-muted sm:text-right">
          {summary.trialEndsAt ? <p>{t('billing.trialEnd', { date: new Date(summary.trialEndsAt).toLocaleDateString(lang) })}</p> : null}
          {summary.status === 'temporary_grant' && summary.temporaryAccessEndsAt ? <p>{t('billing.grantEnd', { date: new Date(summary.temporaryAccessEndsAt).toLocaleDateString(lang) })}</p> : null}
          {summary.periodEndsAt && !summary.trialEndsAt ? <p>{t('billing.periodEnd', { date: new Date(summary.periodEndsAt).toLocaleDateString(lang) })}</p> : null}
          {summary.scheduledPlanId ? <p role="status">{t('billing.scheduled')}</p> : null}
          {summary.cancelAtPeriodEnd && summary.status !== 'trialing' ? <p role="status">{t('billing.cancelScheduled')}</p> : null}
          {summary.status === 'trialing' ? <p>{t('billing.trialNoAutoCharge')}</p> : null}
        </div>
      </div>
      <p className="mt-4 border-t border-border-subtle pt-3 text-sm text-muted">{t(summary.canCreate ? 'billing.preserveContent' : 'billing.readOnlyRetention')}</p>
      {billing.failed ? <p role="alert" className="mt-3 text-sm text-error-ink">{t('billing.error')}</p> : null}
    </section>

    <div role="group" aria-label={t('billing.membershipSections')} className="flex gap-5 overflow-x-auto border-b border-border-subtle px-1 lg:-mx-1">
      {(['summary', 'limits', 'billing'] as const).map((tab) => <button key={tab} id={`membership-tab-${tab}`} type="button" aria-pressed={membershipTab === tab} onClick={() => setMembershipTab(tab)} className={`min-h-12 shrink-0 border-b-2 px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${membershipTab === tab ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{t(tab === 'summary' ? 'billing.summaryTab' : tab === 'limits' ? 'billing.limitsTab' : 'billing.billingTab')}</button>)}
    </div>
    <div id="membership-panel" className="space-y-6">
      {membershipTab === 'summary' ? <>
        <section aria-labelledby="billing-groups-summary" className="space-y-4">
          <div><h3 id="billing-groups-summary" className="text-xl font-semibold text-ink">{t('billing.groups')}</h3><p className="mt-1 text-sm text-muted">{t('billing.groupLinkHint')}</p></div>
          <ul className="divide-y divide-border-subtle border-y border-border-subtle bg-canvas px-3 sm:px-4">{groups.filter(group => summary.groupIds.includes(group.id)).map(group => <li key={group.id} className="flex min-h-14 items-center justify-between gap-3 py-3 text-sm"><span className="truncate font-medium text-ink">{group.name}</span><span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted"><Check className="h-4 w-4 text-primary" aria-hidden="true" />{t('billing.linkedGroup')}</span></li>)}
            {groups.filter(group => summary.groupIds.includes(group.id)).length === 0 ? <li className="px-3 py-3 text-sm text-muted">{t('billing.noLinkedGroups')}</li> : null}
          </ul>
          {configured && summary.canManage ? <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-52 gap-1 text-sm font-medium text-muted">
              {t('billing.linkGroup')}
              <select className="min-h-11 rounded-xl border border-border-subtle bg-surface px-3 text-sm text-ink" value={targetId} onChange={event => setTargetId(event.target.value)} disabled={pending}>
                <option value="">{t('billing.chooseGroup')}</option>
                {groups.filter(group => group.id !== groupId && !summary.groupIds.includes(group.id) && group.role.toLowerCase() === 'owner').map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <Button variant="secondary" disabled={pending || !targetId || linkedCount >= groupCapacity} onClick={() => void billing.link(targetId, true).then(ok => { if (ok) setTargetId('') })}>{t('billing.link')}</Button>
          </div> : null}
          {summary.hasSubscription ? <p className="text-xs text-muted">{t('billing.detachHint')}</p> : null}
        </section>
        {summary.canManage ? <ReferralPanel organizationId={summary.organizationId} /> : null}
      </> : null}
      {membershipTab === 'limits' ? <section aria-labelledby="billing-limits-title" className="space-y-4">
      <div><h3 id="billing-limits-title" className="text-xl font-semibold text-ink">{t('billing.limitsTitle')}</h3><p className="mt-1 text-sm text-muted">{t('billing.limitsHint')}</p></div>
      <div className="grid gap-3 xl:grid-cols-2">{groups.filter(group => summary.groupIds.includes(group.id)).map(group => {
        const groupUsage = usage[group.id]
        return <article key={group.id} className="border-t border-border-subtle py-4 first:border-t-0"><h4 className="mb-4 truncate text-base font-semibold text-ink">{group.name}</h4>
          {groupUsage ? <div className="space-y-4">
            <UsageBar label={t('billing.limitMembers')} metric={groupUsage.members} format={(value) => String(value)} />
            <UsageBar label={t('billing.limitSongs')} metric={groupUsage.songs} format={(value) => String(value)} />
            <UsageBar label={t('billing.limitSetlists')} metric={groupUsage.setlists} format={(value) => String(value)} />
            <UsageBar label={t('billing.limitEvents')} metric={groupUsage.eventsThisMonth} format={(value) => String(value)} />
            <UsageBar label={t('billing.limitStorage')} metric={groupUsage.storageBytes} format={(value) => `${(value / 1024 ** 3).toFixed(1)} GB`} />
          </div> : <p role="status" className="text-sm text-muted">{t('billing.limitsUnavailable')}</p>}
        </article>
      })}</div>
      </section> : null}

      {membershipTab === 'billing' ? <section aria-labelledby="billing-history-title" className="space-y-4">
      {summary.canManage && summary.status === 'trialing' ? <section aria-labelledby="billing-payment-method-title" className="space-y-2 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5">
        <h3 id="billing-payment-method-title" className="text-lg font-semibold text-ink">{t('billing.paymentMethod')}</h3>
        <p className="text-sm leading-6 text-muted">{t('billing.paymentMethodTrialUnavailable')}</p>
      </section> : null}
      {canEditPaymentMethod ? <section aria-labelledby="billing-payment-method-title" className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 id="billing-payment-method-title" className="text-lg font-semibold text-ink">{t('billing.paymentMethod')}</h3>
            {paymentMethodLoaded ? paymentMethod
              ? <p className="mt-1 text-sm text-muted">{paymentMethod.brand} ···· {paymentMethod.last4} · {t('billing.paymentMethodExpiry', { month: paymentMethod.expMonth, year: paymentMethod.expYear })}</p>
              : <p className="mt-1 text-sm text-muted">{t('billing.paymentMethodNone')}</p>
              : <p role="status" className="mt-1 text-sm text-muted">{t('plans.loading')}</p>}
          </div>
          {!paymentSetup ? <Button variant="secondary" disabled={paymentMethodPending} onClick={() => void startPaymentMethodSetup()}>
            {t(paymentMethod ? 'billing.paymentMethodChange' : 'billing.paymentMethodAdd')}
          </Button> : null}
        </div>
        {paymentMethodFailed ? <p role="alert" className="text-sm text-error-ink">{t('billing.paymentMethodError')}</p> : null}
        {paymentMethodSaved ? <p role="status" className="text-sm text-success-ink">{t('billing.paymentMethodUpdated')}</p> : null}
        {paymentSetup ? <PaymentMethodEditor setup={paymentSetup} onCancel={() => setPaymentSetup(null)} onComplete={confirmPaymentMethod} /> : null}
      </section> : null}
      <div className="border-b border-border-subtle pb-4"><h3 id="billing-history-title" className="text-xl font-semibold text-ink">{t('billing.historyTitle')}</h3><p className="mt-1 text-sm text-muted">{t('billing.historyHint')}</p></div>
      {historyFailed ? <p role="alert" className="text-sm text-error-ink">{t('billing.historyError')}</p>
        : history === null ? <p role="status" className="text-sm text-muted">{t('plans.loading')}</p>
          : history.length === 0 ? <p className="rounded-xl border border-border-subtle bg-canvas px-3 py-5 text-center text-sm text-muted">{t('billing.historyEmpty')}</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead><tr className="border-b border-border-subtle text-xs text-muted"><th className="px-3 py-2 font-medium">{t('billing.historyDate')}</th><th className="px-3 py-2 font-medium">{t('billing.historyPeriod')}</th><th className="px-3 py-2 font-medium">{t('billing.historyStatus')}</th><th className="px-3 py-2 text-right font-medium">{t('billing.historyAmount')}</th></tr></thead><tbody className="divide-y divide-border-subtle">{history.map((entry) => <tr key={entry.id}><td className="px-3 py-3 text-ink">{new Date(entry.eventAt).toLocaleDateString(lang)}</td><td className="px-3 py-3 text-muted">{entry.periodStart && entry.periodEnd ? `${new Date(entry.periodStart).toLocaleDateString(lang)} – ${new Date(entry.periodEnd).toLocaleDateString(lang)}` : '—'}</td><td className="px-3 py-3"><span className="rounded-full bg-surface-hover px-2 py-1 text-xs font-medium text-ink">{t(entry.status === 'paid' ? 'billing.historyPaid' : entry.status === 'invoice.payment_failed' ? 'billing.historyFailed' : entry.status === 'charge.refunded' ? 'billing.historyRefunded' : entry.status === 'charge.dispute.created' ? 'billing.historyDispute' : 'billing.historyReview')}</span></td><td className="px-3 py-3 text-right tabular-nums text-ink">{new Intl.NumberFormat(lang, { style: 'currency', currency: entry.currency.toUpperCase() }).format(entry.amountMinor / 100)}</td></tr>)}</tbody></table></div>}
      </section> : null}

    {summary.canManage ? <>
      <PlanSelectionDialog open={planDialogOpen} plans={catalog.plans} selectedPlanId={selection.planId}
        currentPlanId={planActive ? summary.planId : null} step={planStep} amountDue={quote?.amountDue ?? null}
        canContinue={configured && (!summary.hasSubscription ? !['trialing', 'past_due', 'unpaid'].includes(summary.status) : summary.status === 'active' && !summary.cancelAtPeriodEnd)}
        canStartTrial={configured && !summary.hasSubscription && summary.canStartTrial}
        availabilityMessage={summary.status === 'trialing' ? 'billing.changeUnavailableTrial' : ['past_due', 'unpaid'].includes(summary.status) ? 'billing.changeUnavailablePayment' : summary.cancelAtPeriodEnd ? 'billing.changeUnavailableScheduled' : undefined}
        errorMessage={billing.failed} pending={pending}
        onSelect={planId => billing.select({ ...selection, planId, extraGroups: 0 })}
        onContinue={() => {
          if (summary.hasSubscription) void billing.preview().then(ok => { if (ok) setPlanStep('change') })
          else setPlanStep('checkout')
        }}
        onStep={setPlanStep}
        onConfirm={consent => {
          const action = planStep === 'trial' ? billing.trial : () => billing.confirm(consent)
          void action().then(succeeded => { if (succeeded) { setPlanDialogOpen(false); setPlanStep('plans') } })
        }}
        onClose={() => { if (!pending) { setPlanDialogOpen(false); setPlanStep('plans') } }} />

      <ConfirmDialog open={confirmation === 'cancel'} title={t('billing.confirmTitle')} confirmLabel={t('billing.confirm')} cancelLabel={t('common.cancel')}
        pendingLabel={t('plans.loading')} pending={pending}
        onCancel={() => setConfirmation(null)} onConfirm={() => {
          void billing.cancellation().then(succeeded => { if (succeeded) setConfirmation(null) })
        }}>
        <p>{t(summary.cancelAtPeriodEnd ? 'billing.resumeConsent' : 'billing.cancelConsent')}</p>
      </ConfirmDialog>
    </> : <p className="text-sm text-muted">{t('plans.readOnlyHint')}</p>}
    </div>
  </div>
}

function billingStatusLabel(status: string, t: ReturnType<typeof useT>['t']): string {
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
    default: return t('plans.status.unknown')
  }
}

function UsageBar({ label, metric, format }: { label: string; metric: UsageMetric; format: (value: number) => string }) {
  const { t } = useT()
  const limit = metric.limit
  const progress = limit && limit > 0 ? Math.min(100, metric.used / limit * 100) : 0
  return <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted">{label}</span><span className="tabular-nums text-ink">{format(metric.used)} / {limit === null ? t('billing.unlimited') : format(limit)}</span></div>
    {limit !== null ? <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(metric.used, limit)} className="h-1.5 overflow-hidden rounded-full bg-surface-hover"><div className={`h-full rounded-full ${metric.used > limit ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${progress}%` }} /></div> : null}
  </div>
}
