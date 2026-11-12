import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronLeft, X } from 'lucide-react'
import type { PlanCatalogEntry } from '../api/groups'
import { useT } from '../i18n'
import { Button } from '../ui/button'

type SelectionStep = 'plans' | 'checkout' | 'change' | 'trial'

export function PlanSelectionDialog({
  open, plans, selectedPlanId, currentPlanId, step, amountDue, canContinue, canStartTrial, pending,
  availabilityMessage, errorMessage, onSelect, onContinue, onStep, onConfirm, onClose,
}: {
  open: boolean
  plans: PlanCatalogEntry[]
  selectedPlanId: string
  currentPlanId: string | null
  step: SelectionStep
  amountDue: number | null
  canContinue: boolean
  canStartTrial: boolean
  pending: boolean
  availabilityMessage?: string
  errorMessage?: boolean
  onSelect: (planId: string) => void
  onContinue: () => void
  onStep: (step: SelectionStep) => void
  onConfirm: (recurringConsent: boolean) => void
  onClose: () => void
}) {
  const { t, lang } = useT()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [mobilePlanId, setMobilePlanId] = useState(selectedPlanId)
  const [recurringConsent, setRecurringConsent] = useState(false)
  const selectedPlan = plans.find(plan => plan.id === mobilePlanId) ?? plans[0]
  const money = (amount: number) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      closeRef.current?.focus()
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => setMobilePlanId(selectedPlanId), [selectedPlanId])

  function planName(id: string) {
    return t(`plans.name.${id === 'pro' || id === 'studio' ? id : 'starter'}`)
  }

  function limit(value: unknown) {
    return value === null ? t('billing.unlimited') : typeof value === 'number' ? value.toLocaleString(lang) : '—'
  }

  function planDetails(plan: PlanCatalogEntry) {
    const groups = plan.limits.groups
    return <ul className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4 text-sm text-ink/70">
      <li>{t(typeof groups === 'number' && groups === 1 ? 'billing.onePlanGroup' : 'billing.planGroups', { count: typeof groups === 'number' ? groups : 0 })}</li>
      <li>{t('billing.planMembers', { count: typeof plan.limits.members === 'number' ? plan.limits.members : 0 })}</li>
      <li>{t('settings.usageSongs')}: {limit(plan.limits.songs)}</li>
      <li>{t('settings.usageSetlists')}: {limit(plan.limits.setlists)}</li>
      <li>{t('settings.usageStorage')}: {typeof plan.limits.storageGb === 'number' ? `${plan.limits.storageGb} GB` : '—'}</li>
    </ul>
  }

  function moveMobilePlan(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? plans.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : plans.length - 1)) % plans.length
    const planId = plans[next].id
    setMobilePlanId(planId)
    onSelect(planId)
    dialogRef.current?.querySelector<HTMLButtonElement>(`#plan-option-${planId}`)?.focus()
  }

  return <dialog
    ref={dialogRef}
    aria-labelledby="plan-selection-title"
    className="m-auto h-dvh max-h-dvh w-full max-w-none overflow-hidden rounded-none border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-neutral-dark/60 md:!h-fit md:max-h-[calc(100dvh-3rem)] md:w-[min(100%-3rem,72rem)] md:rounded-2xl"
    onCancel={event => { event.preventDefault(); if (!pending) onClose() }}
    onClose={() => { if (open) onClose() }}
  >
    <div className="flex h-dvh min-h-0 flex-col md:h-auto md:max-h-[calc(100dvh-3rem)]">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-4 py-4 sm:px-7 md:py-5">
        <div className="min-w-0">
          {step !== 'plans' ? <button type="button" onClick={() => { setRecurringConsent(false); onStep('plans') }} className="mb-2 inline-flex min-h-8 items-center gap-1 text-sm font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><ChevronLeft className="size-4" aria-hidden="true" />{t('billing.backToPlans')}</button> : null}
          <h2 id="plan-selection-title" className="text-xl font-semibold tracking-tight sm:text-2xl">{t(step === 'plans' ? 'billing.choosePlan' : step === 'trial' ? 'billing.trial' : step === 'change' ? 'billing.preview' : 'billing.checkout')}</h2>
          <p className="mt-1 text-sm text-muted">{t(step === 'plans' ? 'billing.planChoiceHint' : step === 'trial' ? 'billing.trialConsent' : step === 'change' ? 'billing.changeTiming' : 'billing.checkoutReview')}</p>
        </div>
        <button ref={closeRef} type="button" aria-label={t('common.close')} disabled={pending} onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"><X className="size-5" aria-hidden="true" /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-7 sm:py-5">
        {errorMessage ? <p role="alert" className="mb-4 text-sm text-error-ink">{t('billing.error')}</p> : null}
        {step === 'plans' ? <>
          <div className="grid grid-cols-3 gap-2 md:hidden" role="tablist" aria-label={t('billing.choosePlan')}>
            {plans.map((plan, index) => <button key={plan.id} type="button" role="tab" tabIndex={mobilePlanId === plan.id ? 0 : -1} aria-selected={mobilePlanId === plan.id} aria-controls="selected-plan-details" id={`plan-option-${plan.id}`} onKeyDown={event => moveMobilePlan(event, index)} onClick={() => { setMobilePlanId(plan.id); onSelect(plan.id) }} className={`flex min-h-16 min-w-0 flex-col items-center justify-center rounded-xl border px-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${mobilePlanId === plan.id ? 'border-primary bg-primary/5 text-ink' : 'border-border-subtle text-muted'}`}>
              <span className="max-w-full truncate text-sm font-semibold">{planName(plan.id)}</span>
              <span className="text-xs tabular-nums">{money(plan.priceMonthlyMxn)}{t('billing.perMonth')}</span>
              {plan.id === currentPlanId ? <span className="text-[10px] font-semibold text-primary-ink">{t('billing.currentPlan')}</span> : null}
            </button>)}
          </div>
          {availabilityMessage ? <p role="status" className="mt-3 rounded-xl border border-border-subtle bg-canvas px-4 py-3 text-sm leading-6 text-ink">{t(availabilityMessage as Parameters<typeof t>[0])}</p> : null}
          {selectedPlan ? <section id="selected-plan-details" role="tabpanel" aria-labelledby={`plan-option-${selectedPlan.id}`} className="mt-3 rounded-2xl border border-border-subtle bg-canvas p-4 md:hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-lg font-semibold">{planName(selectedPlan.id)}</h3><p className="mt-1 text-2xl font-semibold tabular-nums">{money(selectedPlan.priceMonthlyMxn)}<span className="ml-1 text-sm font-normal text-ink/70">{t('billing.perMonth')}</span></p></div>
              {selectedPlan.id === currentPlanId ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary-ink">{t('billing.currentPlan')}</span> : null}
            </div>
            <div className="mt-4">{planDetails(selectedPlan)}</div>
          </section> : null}
          <fieldset className="hidden gap-3 md:grid md:grid-cols-3">
            <legend className="sr-only">{t('billing.choosePlan')}</legend>
            {plans.map(plan => {
              const selected = selectedPlanId === plan.id
              const current = currentPlanId === plan.id
              return <label key={plan.id} className={`flex min-h-64 cursor-pointer flex-col rounded-2xl border p-5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border-subtle bg-canvas hover:border-primary/40'}`}>
                <span className="flex items-start justify-between gap-3"><span className="text-lg font-semibold">{planName(plan.id)}{current ? <span className="mt-1 block text-xs font-semibold text-primary-ink">{t('billing.currentPlan')}</span> : null}</span><input type="radio" name="billing-plan-choice" checked={selected} disabled={pending} onChange={() => onSelect(plan.id)} aria-label={`${planName(plan.id)}, ${money(plan.priceMonthlyMxn)} ${t('billing.perMonth')}${current ? `, ${t('billing.currentPlan')}` : ''}`} className="mt-1 size-4 shrink-0 accent-primary" /></span>
                <p className="mt-4 text-2xl font-semibold tabular-nums">{money(plan.priceMonthlyMxn)}<span className="ml-1 text-sm font-normal text-ink/70">{t('billing.perMonth')}</span></p>
                <div className="mt-4">{planDetails(plan)}</div>
                <span className={`mt-auto inline-flex min-h-9 items-center gap-2 pt-4 text-sm font-semibold ${selected ? 'text-primary-ink' : 'text-muted'}`}>{selected ? <><Check className="size-4" aria-hidden="true" />{t('billing.selectedPlan')}</> : null}</span>
              </label>
            })}
          </fieldset>
        </> : <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-border-subtle bg-canvas p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold">{planName(selectedPlanId)}</h3><p className="mt-1 text-2xl font-semibold tabular-nums">{money(plans.find(plan => plan.id === selectedPlanId)?.priceMonthlyMxn ?? 0)}<span className="ml-1 text-sm font-normal text-muted">{t('billing.perMonth')}</span></p></div>{step === 'change' && amountDue !== null ? <span className="text-right text-sm text-muted">{t('billing.quote', { amount: money(amountDue / 100) })}</span> : null}</div>
          {step === 'checkout' || step === 'change' ? <>
            <p className="text-sm leading-6 text-muted">{t('billing.recurringDisclosure', { plan: planName(selectedPlanId), amount: money(plans.find(plan => plan.id === selectedPlanId)?.priceMonthlyMxn ?? 0), timing: step === 'checkout' ? t('billing.firstChargeNow') : t('billing.changeChargeNow', { amount: money((amountDue ?? 0) / 100) }) })}</p>
            <label className="flex items-start gap-3 border-t border-border-subtle pt-4 text-sm text-ink"><input type="checkbox" checked={recurringConsent} onChange={event => setRecurringConsent(event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" /><span>{t('billing.recurringConsent', { amount: money(plans.find(plan => plan.id === selectedPlanId)?.priceMonthlyMxn ?? 0) })}</span></label>
          </> : <p className="text-sm leading-6 text-muted">{t('billing.trialConsent')}</p>}
        </div>}
      </div>

      <footer className="flex shrink-0 flex-col gap-3 border-t border-border-subtle bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-7">
        {step === 'plans' ? <>
          {canStartTrial && selectedPlanId === 'pro' ? <Button variant="secondary" disabled={pending} onClick={() => onStep('trial')}>{t('billing.trial')}</Button> : <span className="hidden text-sm text-muted sm:block">{t('billing.planChoiceHint')}</span>}
          <Button className="w-full sm:w-auto" disabled={!canContinue || pending || selectedPlanId === currentPlanId} onClick={onContinue}>{t(currentPlanId ? 'billing.preview' : 'billing.checkout')}</Button>
        </> : <>
          <Button variant="secondary" disabled={pending} onClick={() => { setRecurringConsent(false); onStep('plans') }}>{t('common.cancel')}</Button>
          <Button className="w-full sm:w-auto" disabled={pending || ((step === 'checkout' || step === 'change') && !recurringConsent)} onClick={() => onConfirm(recurringConsent)}>{t(step === 'trial' ? 'billing.trial' : 'billing.confirm')}</Button>
        </>}
      </footer>
    </div>
  </dialog>
}
