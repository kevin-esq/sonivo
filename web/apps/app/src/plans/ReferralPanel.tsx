import { useEffect, useState } from 'react'
import { applyBillingReferral, getBillingReferral, type BillingReferralSummary } from '../api/billing'
import { problemDetail } from '../api/http'
import { useT } from '../i18n'
import { useCopyToClipboard } from '../hooks/useCopyToClipboard'
import { Button } from '../ui/button'
import { isReferralCode, pendingReferralCodeKey } from '../lib/referral'

export function ReferralPanel({ organizationId }: { organizationId: string }) {
  const { t } = useT()
  const [summary, setSummary] = useState<BillingReferralSummary | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedError, setCopiedError] = useState(false)
  const [linkCopyError, setLinkCopyError] = useState(false)
  const { copy: copyCodeText, copied: codeCopied } = useCopyToClipboard()
  const { copy: copyLink, copied: linkCopied } = useCopyToClipboard()

  useEffect(() => {
    try {
      const pendingCode = window.localStorage.getItem(pendingReferralCodeKey)
      if (isReferralCode(pendingCode)) setCode(pendingCode)
    } catch {
      // Manual code entry remains available when browser storage is unavailable.
    }
  }, [])

  useEffect(() => {
    let active = true
    getBillingReferral(organizationId).then(value => {
      if (active) setSummary(value)
    }).catch(cause => {
      if (active) setError(problemDetail(cause, t))
    })
    return () => { active = false }
  }, [organizationId, t])

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const result = await applyBillingReferral(organizationId, code.trim())
      setSummary(result)
      setCode('')
      try {
        window.localStorage.removeItem(pendingReferralCodeKey)
      } catch {
        // Keeping a stale local hint does not affect server-side attribution.
      }
    } catch (cause) {
      setError(problemDetail(cause, t))
    } finally {
      setPending(false)
    }
  }

  async function copyCode() {
    setCopiedError(!await copyCodeText(summary?.referralCode ?? ''))
  }

  async function copyReferralLink() {
    if (!summary) return
    const link = new URL('/auth/register', window.location.origin)
    link.searchParams.set('referral', summary.referralCode)
    setLinkCopyError(!await copyLink(link.href))
  }

  if (!summary && !error) return <p role="status" className="text-sm text-muted">{t('referral.loading')}</p>

  return <section aria-labelledby="billing-referral-title" className="space-y-4 border-t border-border-subtle pt-5">
    <div className="space-y-1">
      <h3 id="billing-referral-title" className="text-lg font-semibold text-ink">{t('referral.title')}</h3>
      <p className="text-sm text-muted">{t('referral.description')}</p>
    </div>
    {error ? <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error-ink">{error}</p> : null}
    {summary ? <>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border-subtle bg-surface p-3">
        <div className="min-w-40 flex-1">
          <p className="text-xs font-medium text-muted">{t('referral.yourCode')}</p>
          <p className="mt-1 select-all font-mono text-base font-semibold tracking-wider text-ink">{summary.referralCode}</p>
        </div>
        <Button variant="secondary" onClick={() => void copyCode()}>{t(codeCopied ? 'referral.copied' : 'referral.copy')}</Button>
        <Button variant="secondary" onClick={() => void copyReferralLink()}>{t(linkCopied ? 'referral.linkCopied' : 'referral.copyLink')}</Button>
      </div>
      {copiedError ? <p role="alert" className="text-sm text-error-ink">{t('referral.copyError')}</p> : null}
      {codeCopied ? <p role="status" className="text-sm text-muted">{t('referral.copied')}</p> : null}
      {linkCopyError ? <p role="alert" className="text-sm text-error-ink">{t('referral.linkCopyError')}</p> : null}
      {linkCopied ? <p role="status" className="text-sm text-muted">{t('referral.linkCopied')}</p> : null}
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <Metric label={t('referral.referred')} value={summary.referredOrganizations} />
        <Metric label={t('referral.rewarded')} value={summary.rewardedDays} suffix={t('referral.days')} />
        <Metric label={t('referral.pending')} value={summary.pendingDays} suffix={t('referral.days')} />
      </dl>
      {summary.attributedToCode ? <p role="status" className="text-sm text-muted">{t('referral.applied', { code: summary.attributedToCode })}</p> : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void submit() }}>
          <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium text-muted">
            {t('referral.enterCode')}
            <input autoComplete="off" autoCapitalize="none" maxLength={32} value={code}
              onChange={event => setCode(event.target.value)}
              className="min-h-11 rounded-xl border border-border-subtle bg-surface px-3 text-sm text-ink"
              aria-describedby="billing-referral-hint" disabled={pending} />
          </label>
          <Button type="submit" variant="secondary" disabled={pending || code.trim().length < 16}>{t(pending ? 'referral.applying' : 'referral.apply')}</Button>
          <p id="billing-referral-hint" className="basis-full text-xs text-muted">{t('referral.applyHint')}</p>
        </form>
      )}
    </> : null}
  </section>
}

function Metric({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return <div className="rounded-xl bg-surface-hover px-3 py-2">
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="mt-1 font-semibold tabular-nums text-ink">{value}{suffix ? ` ${suffix}` : ''}</dd>
  </div>
}
