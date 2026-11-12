import { useCallback, useEffect, useRef, useState } from 'react'
import { cancelBilling, changeBilling, getBilling, linkBillingGroup, previewBillingChange,
  startGroupCheckout, startTrial, type BillingQuote, type BillingSelection, type BillingSummary } from '../api/billing'

export function useBilling(groupId: string, initialSummary?: BillingSummary) {
  const [summary, setSummary] = useState<BillingSummary | null>(initialSummary ?? null)
  const [selection, setSelection] = useState<BillingSelection>({ planId: 'starter', interval: 'month', extraGroups: 0 })
  const [quote, setQuote] = useState<BillingQuote | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const operation = useRef<{ kind: string; id: string } | null>(null)
  const reload = useCallback(async () => {
    const result = await getBilling(groupId)
    setSummary(result)
    return result
  }, [groupId])
  useEffect(() => {
    let active = true
    if (initialSummary) {
      setSummary(initialSummary)
      setSelection({ planId: initialSummary.planId, interval: 'month', extraGroups: 0 })
    }
    if (!initialSummary) {
      getBilling(groupId).then(result => {
        if (!active) return
        setSummary(result)
        setSelection({ planId: result.planId, interval: 'month', extraGroups: 0 })
      }).catch(() => { if (active) setFailed(true) })
    }
    const timer = window.setInterval(() => { if (active) void reload().catch(() => setFailed(true)) }, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [groupId, initialSummary, reload])
  async function run(action: () => Promise<void>) {
    setPending(true); setFailed(false)
    try { await action(); operation.current = null; await reload(); return true }
    catch { setFailed(true); return false }
    finally { setPending(false) }
  }
  function redirect(url: string) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(parsed.hostname)) throw new Error('Invalid billing redirect.')
    window.location.assign(parsed.href)
  }
  function operationId(kind: string) {
    if (operation.current?.kind !== kind) operation.current = { kind, id: crypto.randomUUID() }
    return operation.current.id
  }
  return {
    summary, selection, quote, pending, failed,
    select(value: BillingSelection) { setSelection(value); setQuote(null); operation.current = null },
    preview: () => run(async () => { setQuote(await previewBillingChange(groupId, selection)) }),
    confirm: (recurringConsent = false) => run(async () => {
      if (summary?.hasSubscription) {
        if (!quote) throw new Error('Billing quote required.')
        await changeBilling(groupId, selection, quote.quoteId, operationId('change'), recurringConsent); setQuote(null)
      } else redirect(await startGroupCheckout(groupId, selection.planId, selection.interval, selection.extraGroups, operationId('checkout'), recurringConsent))
    }),
    trial: () => run(() => startTrial(groupId, selection.planId)),
    cancellation: () => run(() => cancelBilling(groupId, !summary?.cancelAtPeriodEnd, operationId('cancellation'))),
    link: (targetId: string, link: boolean) => run(() => linkBillingGroup(groupId, targetId, link)),
    retry: () => run(async () => { await reload() }),
  }
}
