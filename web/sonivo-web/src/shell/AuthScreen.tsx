import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchAuthProviders,
  googleChallengeHref,
  loginUser,
  problemDetail,
  registerUser,
  resendConfirmation,
  type CurrentUser,
} from '../api/client'
import { BrandLockup, WaveformHero } from '../brand/SonivoMark'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { SessionScreen } from './GroupsChrome'
import { safeJoinNextPath } from '../tenancy/safeJoinNextPath'

export function GuestAuthRoute({
  user,
  mode,
  onSuccess,
}: {
  user: CurrentUser | null | undefined
  mode: 'login' | 'register'
  onSuccess: (user: CurrentUser) => void
}) {
  const [searchParams] = useSearchParams()
  const next = safeJoinNextPath(searchParams.get('next'))
  if (user === undefined) {
    return <SessionScreen message="Comprobando sesión…" />
  }
  if (user) {
    return <Navigate to={next ?? '/'} replace />
  }
  return <AuthScreen mode={mode} onSuccess={onSuccess} />
}

function AuthScreen({
  mode,
  onSuccess,
}: {
  mode: 'login' | 'register'
  onSuccess: (user: CurrentUser) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [resendOpen, setResendOpen] = useState(false)
  const [resendPending, setResendPending] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = safeJoinNextPath(searchParams.get('next'))
  const otherModeTo =
    mode === 'login'
      ? next
        ? `/register?next=${encodeURIComponent(next)}`
        : '/register'
      : next
        ? `/login?next=${encodeURIComponent(next)}`
        : '/login'
  const headingId = useId()

  useEffect(() => {
    let cancelled = false
    void fetchAuthProviders()
      .then((providers) => {
        if (!cancelled) {
          setGoogleEnabled(providers.google === true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleEnabled(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      if (mode === 'register') {
        // T-AU-01: register never signs in — the mailbox must be proven first.
        await registerUser({ email, password, displayName: displayName || undefined })
        setRegistered(true)
      } else {
        const user = await loginUser({ email, password })
        onSuccess(user)
        navigate(next ?? '/')
      }
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPending(false)
    }
  }

  async function onResend() {
    setResendPending(true)
    setResendError(null)
    try {
      await resendConfirmation(email)
      setResendSent(true)
    } catch (err) {
      setResendError(problemDetail(err))
    } finally {
      setResendPending(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,28rem)]">
      <section
        className="relative hidden overflow-hidden px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{ background: 'linear-gradient(to bottom right, #1a1440, #0F172A, #24183a)' }}
      >
        <BrandLockup to="/login" light />
        <div className="max-w-md space-y-4">
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-balance">
            La música nos une
          </h1>
          <p className="text-base text-slate-300">
            Organiza tus listas, crea eventos y lleva tu música al siguiente nivel.
          </p>
        </div>
        <WaveformHero className="max-w-xl opacity-90" />
      </section>

      <div className="flex flex-col justify-center bg-white px-6 py-10 text-neutral-dark sm:px-10">
        <div className="mb-8 lg:hidden">
          <BrandLockup to="/login" />
        </div>
        {mode === 'register' && registered ? (
          <div className="space-y-4" aria-labelledby={headingId}>
            <div className="space-y-1">
              <h1 id={headingId} className="text-2xl font-bold tracking-tight">
                Confirma tu correo
              </h1>
              <p className="text-sm text-slate-600">Te enviamos un enlace de confirmación</p>
              <p className="text-sm text-slate-500">
                Revisa tu bandeja y sigue el enlace para activar tu cuenta. Luego inicia sesión.
              </p>
            </div>
            <Link
              className="inline-block font-semibold text-primary no-underline hover:underline"
              to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit} noValidate aria-labelledby={headingId}>
            <div className="space-y-1">
              <h1 id={headingId} className="text-2xl font-bold tracking-tight">
                {mode === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </h1>
              <p className="text-sm text-slate-500">
                {mode === 'login'
                  ? 'Bienvenido de nuevo. Accede a tu cuenta para continuar.'
                  : 'Crea una cuenta con correo y contraseña para organizar tu música.'}
              </p>
            </div>
            {error ? (
              <p role="alert" className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </p>
            ) : null}
            {mode === 'register' ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Nombre</span>
                <input
                  className={fieldClass}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                />
              </label>
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
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Contraseña</span>
              <input
                className={fieldClass}
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Trabajando…' : mode === 'login' ? 'Iniciar sesión' : 'Registrarse'}
            </Button>
            {googleEnabled ? (
              <>
                <div className="relative py-1 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
                  <span className="relative z-10 bg-white px-2">o</span>
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" aria-hidden />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    window.location.assign(googleChallengeHref(next))
                  }}
                >
                  Continuar con Google
                </Button>
              </>
            ) : null}
            {mode === 'login' ? (
              <div className="space-y-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
                <p>Tu cuenta aún no está verificada — revisa tu bandeja o reenvía el correo</p>
                {!resendOpen ? (
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => {
                      setResendOpen(true)
                      setResendSent(false)
                      setResendError(null)
                    }}
                  >
                    Reenviar correo
                  </button>
                ) : resendSent ? (
                  <p>Te enviamos un enlace de confirmación</p>
                ) : (
                  <div className="space-y-2">
                    {resendError ? (
                      <p role="alert" className="text-error">
                        {resendError}
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
                    <Button
                      type="button"
                      variant="outline"
                      disabled={resendPending}
                      onClick={() => void onResend()}
                    >
                      {resendPending ? 'Enviando…' : 'Reenviar correo'}
                    </Button>
                  </div>
                )}
                <p>
                  <Link
                    className="font-semibold text-primary no-underline hover:underline"
                    to="/forgot-password"
                  >
                    ¿Olvidaste tu contraseña? Restablecer contraseña
                  </Link>
                </p>
              </div>
            ) : null}
            <p className="text-sm text-slate-600">
              {mode === 'login' ? (
                <>
                  ¿No tienes una cuenta?{' '}
                  <Link className="font-semibold text-primary no-underline hover:underline" to={otherModeTo}>
                    Regístrate
                  </Link>
                </>
              ) : (
                <>
                  ¿Ya tienes una cuenta?{' '}
                  <Link className="font-semibold text-primary no-underline hover:underline" to={otherModeTo}>
                    Iniciar sesión
                  </Link>
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
