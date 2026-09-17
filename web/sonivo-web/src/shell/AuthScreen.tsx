import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { loginUser, problemDetail, registerUser, type CurrentUser } from '../api/client'
import { BrandLockup, WaveformHero } from '../brand/SonivoMark'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { SessionScreen } from './GroupsChrome'
import { safeJoinNextPath } from '../tenancy/JoinPage'

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      if (mode === 'register') {
        await registerUser({ email, password, displayName: displayName || undefined })
        const user = await loginUser({ email, password })
        onSuccess(user)
      } else {
        const user = await loginUser({ email, password })
        onSuccess(user)
      }
      navigate(next ?? '/')
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPending(false)
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
            Organiza tus setlists, crea eventos y lleva tu música al siguiente nivel.
          </p>
        </div>
        <WaveformHero className="max-w-xl opacity-90" />
      </section>

      <div className="flex flex-col justify-center bg-white px-6 py-10 text-neutral-dark sm:px-10">
        <div className="mb-8 lg:hidden">
          <BrandLockup to="/login" />
        </div>
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
      </div>
    </div>
  )
}
