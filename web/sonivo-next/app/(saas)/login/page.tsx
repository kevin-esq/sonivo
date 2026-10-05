'use client'

import { useState, type FormEvent } from 'react'
import { loginUser } from '@/lib/api/client'
import { useT } from '@/lib/i18n/I18nProvider'

export default function LoginPage() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    try {
      await loginUser({ email, password })
      window.location.assign('/')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-bold">{t('login.title')}</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm">{t('login.email')}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm">{t('login.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            required
          />
        </label>
        {failed ? <p role="alert" className="text-sm text-red-600">{t('handoff.error')}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full px-5 py-2 font-semibold disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          {busy ? t('login.working') : t('login.submit')}
        </button>
      </form>
    </main>
  )
}
