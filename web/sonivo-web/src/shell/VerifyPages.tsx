import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  confirmEmail,
  forgotPassword,
  problemDetail,
  resetPassword,
  resendConfirmation,
} from '../api/client'
import { BrandLockup } from '../brand/SonivoMark'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'

function VerifyShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas px-6 py-10 text-neutral-dark">
      <div className="mb-10">
        <BrandLockup to="/login" />
      </div>
      <main className="mx-auto w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {children}
      </main>
    </div>
  )
}

export function ConfirmPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const token = searchParams.get('token') ?? ''
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending')
  const [resent, setResent] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        await confirmEmail({ email, token })
        if (!cancelled) setStatus('ok')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    if (email && token) {
      void run()
    } else {
      setStatus('error')
    }
    return () => {
      cancelled = true
    }
  }, [email, token])

  return (
    <VerifyShell title="Confirma tu correo">
      {status === 'pending' ? <p className="text-sm text-slate-600">Confirmando…</p> : null}
      {status === 'ok' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">¡Correo confirmado! Ya puedes iniciar sesión.</p>
          <Link
            className="inline-block font-semibold text-primary no-underline hover:underline"
            to="/login"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-error">
            Enlace expirado o inválido — solicita uno nuevo
          </p>
          {resent ? (
            <p className="text-sm text-slate-600">Te enviamos un enlace de confirmación</p>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void resendConfirmation(email || '').then(() => setResent(true))
              }}
              disabled={!email}
            >
              Reenviar correo
            </Button>
          )}
        </div>
      ) : null}
    </VerifyShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <VerifyShell title="Restablecer contraseña">
      {sent ? (
        <p className="text-sm text-slate-600">
          Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <p role="alert" className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Correo electrónico</span>
            <input
              className={fieldClass}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Enviando…' : 'Restablecer contraseña'}
          </Button>
        </form>
      )}
    </VerifyShell>
  )
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await resetPassword({ email, token, newPassword: password })
      setDone(true)
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <VerifyShell title="Restablecer contraseña">
      {!email || !token ? (
        <p role="alert" className="text-sm text-error">
          Enlace expirado o inválido — solicita uno nuevo
        </p>
      ) : done ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Contraseña actualizada. Ya puedes iniciar sesión.</p>
          <Link
            className="inline-block font-semibold text-primary no-underline hover:underline"
            to="/login"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <p role="alert" className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Nueva contraseña</span>
            <input
              className={fieldClass}
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Guardando…' : 'Restablecer contraseña'}
          </Button>
        </form>
      )}
    </VerifyShell>
  )
}
