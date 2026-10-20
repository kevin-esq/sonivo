import { useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  disableTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactorEnroll,
  verifyTwoFactorEnroll,
  problemDetail,
  type TwoFactorStatus,
} from '../../api/client'
import { Button } from '../../ui/button'
import { fieldClass } from '../../ui/field'
import { useT } from '../../i18n'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function TwoFactorSection({
  status,
  onStatusChanged,
}: {
  status: TwoFactorStatus | null
  onStatusChanged: () => void
}) {
  const [enroll, setEnroll] = useState<{ uri: string; manualKey: string } | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [disablePassword, setDisablePassword] = useState('')
  const [regenPassword, setRegenPassword] = useState('')
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedUri, setCopiedUri] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useT()

  async function onStartEnroll() {
    setPending(true)
    setError(null)
    try {
      setEnroll(await startTwoFactorEnroll())
    } catch (err) {
      setError(problemDetail(err, t))
    } finally {
      setPending(false)
    }
  }

  async function onConfirmEnroll(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await verifyTwoFactorEnroll(confirmCode.trim())
      setCodes(result.recoveryCodes)
      setEnroll(null)
      setConfirmCode('')
      onStatusChanged()
    } catch (err) {
      setError(problemDetail(err, t))
    } finally {
      setPending(false)
    }
  }

  async function onDisable(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await disableTwoFactor(
        status?.hasPassword ? disablePassword : undefined,
      )
      setDisablePassword('')
      onStatusChanged()
    } catch (err) {
      setError(problemDetail(err, t))
    } finally {
      setPending(false)
    }
  }

  async function onRegenerate(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await regenerateRecoveryCodes(
        status?.hasPassword ? regenPassword : undefined,
      )
      setRegenPassword('')
      setCodes(result.recoveryCodes)
      onStatusChanged()
    } catch (err) {
      setError(problemDetail(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="security-section space-y-4 rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm sm:p-6">
      {error ? (
        <p role="alert" className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      {status === null || !status.enabled ? (
        enroll ? (
          <form className="space-y-4 max-w-lg" onSubmit={onConfirmEnroll} noValidate>
            <h2 className="text-lg font-bold text-ink">{t('security.totpTitle')}</h2>
            <p className="text-sm text-muted">
              {t('security.totpEnrollHint')}
            </p>
            <div className="flex flex-col items-center justify-center space-y-3 rounded-xl border border-border-subtle bg-surface-hover p-4">
              <QRCodeSVG value={enroll.uri} size={180} level="M" className="rounded-lg border bg-white p-2 shadow-sm" />
              <p className="text-xs font-medium text-muted">{t('security.totpQrCaption')}</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('security.manualKey')}</span>
              <input className={fieldClass} readOnly value={enroll.manualKey} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void copyText(enroll.manualKey).then((ok) => setCopiedKey(ok))
                }}
              >
                {copiedKey ? t('security.keyCopied') : t('security.copyKey')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void copyText(enroll.uri).then((ok) => setCopiedUri(ok))
                }}
              >
                {copiedUri ? t('security.linkCopied') : t('security.copyLink')}
              </Button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('security.sixDigitCode')}</span>
              <input
                className={fieldClass}
                required
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? t('security.verifying') : t('security.confirmActivate')}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-ink">{t('security.totpTitle')}</h2>
            <p className="text-sm text-muted">
              {t('security.totpOffHint')}
            </p>
            <Button type="button" onClick={() => void onStartEnroll()} disabled={pending}>
              {pending ? t('security.working') : t('security.activateTotp')}
            </Button>
          </div>
        )
      ) : (
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-ink">{t('security.totpTitle')}</h2>
            <p className="text-sm text-muted">
              {t('security.totpOnHint')}
            </p>
          </div>
          <form className="space-y-3 max-w-md" onSubmit={onRegenerate} noValidate>
            <h3 className="font-semibold text-ink">{t('security.recoveryCodes')}</h3>
            {status.hasPassword ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('security.regenPasswordLabel')}</span>
                <input
                  type="password"
                  className={fieldClass}
                  required
                  value={regenPassword}
                  onChange={(e) => setRegenPassword(e.target.value)}
                />
              </label>
            ) : null}
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? t('security.generating') : t('security.regenCodes')}
            </Button>
          </form>

          <form className="max-w-md space-y-3 border-t border-border-subtle pt-4" onSubmit={onDisable} noValidate>
            <h3 className="font-semibold text-error-ink">{t('security.disableTotp')}</h3>
            {status.hasPassword ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('security.passwordLabel')}</span>
                <input
                  type="password"
                  className={fieldClass}
                  required
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
              </label>
            ) : null}
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? t('security.disabling') : t('security.disableTotpLong')}
            </Button>
          </form>
        </div>
      )}

      {codes ? (
        <section
          aria-label={t('security.recoveryCodes')}
          role="region"
          className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4 mt-6"
        >
          <h3 className="font-semibold text-shell-link">{t('security.saveCodesTitle')}</h3>
          <p className="text-xs text-muted">
            {t('security.saveCodesHint')}
          </p>
          <ul className="grid grid-cols-2 gap-2 text-center font-mono text-sm">
            {codes.map((code) => (
              <li key={code} className="rounded-lg border border-primary/25 bg-canvas p-2 text-ink">
                {code}
              </li>
            ))}
          </ul>
          <Button type="button" onClick={() => setCodes(null)}>
            {t('security.codesSaved')}
          </Button>
        </section>
      ) : null}
    </section>
  )
}
