import { useState } from 'react'
import { changePassword, problemDetail } from '../api/client'
import { useT } from '../i18n'
import { Button } from '../ui/button'

/**
 * Blocking change-password gate (ADR-0047). Rendered instead of the app while
 * ApplicationUser.MustChangePassword is set; it cannot be dismissed by Escape and
 * has no close button.
 */
export function MustChangePassword({ onDone }: { onDone: () => void }) {
  const { t } = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (next !== confirm) {
      setError(t('mustChange.mismatch'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await changePassword({ currentPassword: current, newPassword: next })
      onDone()
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="must-change-title"
        className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-6 text-ink shadow-lg"
        data-testid="must-change-password"
      >
        <h1 id="must-change-title" className="text-xl font-semibold">
          {t('mustChange.title')}
        </h1>
        <p className="text-sm text-slate-600">{t('mustChange.body')}</p>

        <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('mustChange.current')}</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('mustChange.new')}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('mustChange.confirm')}</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-error-ink">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={busy} data-testid="must-change-submit">
            {t('mustChange.submit')}
          </Button>
        </form>

        <p className="text-xs text-slate-500">{t('mustChange.managedNotice')}</p>
      </div>
    </div>
  )
}
