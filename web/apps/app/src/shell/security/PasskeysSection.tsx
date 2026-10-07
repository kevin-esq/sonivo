import { useState, useEffect, type FormEvent } from 'react'
import {
  fetchPasskeys,
  startPasskeyRegistration,
  finishPasskeyRegistration,
  deletePasskey,
  problemDetail,
  type PasskeyItem,
} from '../../api/client'
import { Button } from '../../ui/button'
import { useT } from '../../i18n'
import { performWebAuthnRegistration } from '../webauthn'

const fieldClass = 'w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'

export function PasskeysSection() {
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([])
  const [passkeyName, setPasskeyName] = useState('')
  const [passkeyPending, setPasskeyPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useT()

  useEffect(() => {
    let cancelled = false
    async function loadPasskeys() {
      try {
        const list = await fetchPasskeys()
        if (!cancelled) setPasskeys(list)
      } catch {
        // Ignore when there is no session
      }
    }
    void loadPasskeys()
    return () => {
      cancelled = true
    }
  }, [])

  async function onRegisterPasskey(event: FormEvent) {
    event.preventDefault()
    setPasskeyPending(true)
    setError(null)
    try {
      const opts = await startPasskeyRegistration()
      const reg = await performWebAuthnRegistration(
        opts.challenge,
        opts.rpId,
        opts.rpName,
        opts.user,
      )
      await finishPasskeyRegistration({
        attestationObject: reg.attestationObject ?? '',
        clientData: reg.clientDataJSON ?? '',
        deviceName: passkeyName.trim() || undefined,
      })
      setPasskeyName('')
      setPasskeys(await fetchPasskeys())
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPasskeyPending(false)
    }
  }

  async function onDeletePasskey(id: string) {
    setPasskeyPending(true)
    setError(null)
    try {
      await deletePasskey(id)
      setPasskeys(await fetchPasskeys())
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPasskeyPending(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('security.passkeysTitle')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('security.passkeysHint')}
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {passkeys.length > 0 ? (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 overflow-hidden">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between p-3.5">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{pk.name || t('security.passkeyFallbackName')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('security.addedOnPrefix')}{new Date(pk.createdAt).toLocaleDateString()}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={passkeyPending}
                onClick={() => void onDeletePasskey(pk.id)}
              >
                {t('security.deletePasskey')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500 italic">{t('security.noPasskeys')}</p>
      )}

      <form onSubmit={onRegisterPasskey} className="flex flex-wrap items-end gap-3 max-w-xl">
        <label className="block flex-1 min-w-[200px] space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('security.deviceName')}</span>
          <input
            className={fieldClass}
            placeholder={t('security.devicePlaceholder')}
            value={passkeyName}
            onChange={(e) => setPasskeyName(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={passkeyPending}>
          {passkeyPending ? t('security.addingPasskey') : t('security.addPasskey')}
        </Button>
      </form>
    </section>
  )
}
