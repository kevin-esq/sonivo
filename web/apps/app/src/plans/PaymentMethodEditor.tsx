'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import type { PaymentMethodSetup } from '../api/billing'

export function PaymentMethodEditor({ setup, onCancel, onComplete }: {
  setup: PaymentMethodSetup
  onCancel: () => void
  onComplete: (setupIntentId: string, operationId: string) => Promise<void>
}) {
  const stripePromise = useMemo(() => loadStripe(setup.publishableKey), [setup.publishableKey])
  const appearance = useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    return {
      theme: document.documentElement.dataset.theme === 'dark' ? 'night' as const : 'stripe' as const,
      variables: {
        colorPrimary: styles.getPropertyValue('--color-primary').trim() || '#8366f1',
        colorText: styles.getPropertyValue('--color-ink').trim() || '#0f172a',
        colorBackground: styles.getPropertyValue('--color-surface').trim() || '#ffffff',
        borderRadius: '12px',
      },
    }
  }, [])

  return <Elements stripe={stripePromise} options={{ clientSecret: setup.clientSecret, appearance }}>
    <PaymentMethodForm onCancel={onCancel} onComplete={onComplete} />
  </Elements>
}

function PaymentMethodForm({ onCancel, onComplete }: {
  onCancel: () => void
  onComplete: (setupIntentId: string, operationId: string) => Promise<void>
}) {
  const { t, lang } = useT()
  const stripe = useStripe()
  const elements = useElements()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmedIntentId, setConfirmedIntentId] = useState<string | null>(null)
  const operationId = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!stripe || !elements || pending) return
    setPending(true)
    setError(null)
    try {
      if (confirmedIntentId) {
        operationId.current ??= crypto.randomUUID()
        await onComplete(confirmedIntentId, operationId.current)
        return
      }
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
      if (result.error) throw new Error(t('billing.paymentMethodError'))
      if (result.setupIntent.status !== 'succeeded') throw new Error(t('billing.paymentMethodError'))
      setConfirmedIntentId(result.setupIntent.id)
      operationId.current = crypto.randomUUID()
      await onComplete(result.setupIntent.id, operationId.current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('billing.paymentMethodError'))
    } finally {
      setPending(false)
    }
  }

  return <form onSubmit={event => void submit(event)} className="space-y-4 rounded-2xl border border-border-subtle bg-canvas p-4 sm:p-5">
    <PaymentElement options={{ layout: 'accordion', wallets: { applePay: 'never', googlePay: 'never' } }} />
    <p className="text-sm leading-6 text-muted">{t('billing.paymentMethodConsent')}</p>
    {error ? <p role="alert" className="text-sm text-error-ink">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={!stripe || !elements || pending}>
        {t(pending ? 'billing.paymentMethodSaving' : confirmedIntentId ? 'billing.paymentMethodRetry' : 'billing.paymentMethodSave')}
      </Button>
      <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>{t('common.cancel')}</Button>
    </div>
  </form>
}
