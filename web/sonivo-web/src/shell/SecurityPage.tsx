import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  disableTwoFactor,
  fetchTwoFactorStatus,
  problemDetail,
  regenerateRecoveryCodes,
  startTwoFactorEnroll,
  verifyTwoFactorEnroll,
  type TwoFactorStatus,
} from '../api/client'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function RecoveryCodes({
  codes,
  onSaved,
}: {
  codes: string[]
  onSaved: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <section aria-label="Códigos de recuperación" className="space-y-3">
      <h2 className="text-lg font-bold">Códigos de recuperación — guárdalos en un lugar seguro</h2>
      <p className="text-sm font-medium text-error">
        Se muestran una sola vez. Si los pierdes, genera unos nuevos mientras tengas sesión.
      </p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void copyText(codes.join('\n')).then((ok) => setCopied(ok))
          }}
        >
          {copied ? 'Copiados' : 'Copiar códigos'}
        </Button>
        <Button type="button" onClick={onSaved}>
          He guardado mis códigos
        </Button>
      </div>
    </section>
  )
}

/** T-AU-02: opt-in TOTP two-factor management (ADR-0038 S2). No QR library — manual key + link copy. */
export function SecurityPage() {
  const [status, setStatus] = useState<TwoFactorStatus | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [enroll, setEnroll] = useState<{ uri: string; manualKey: string } | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedUri, setCopiedUri] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [regenPassword, setRegenPassword] = useState('')

  async function refresh() {
    try {
      setStatus(await fetchTwoFactorStatus())
    } catch (err) {
      setError(problemDetail(err))
    }
  }

  useEffect(() => {
    let cancelled = false
    void fetchTwoFactorStatus()
      .then((fresh) => {
        if (!cancelled) {
          setStatus(fresh)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(problemDetail(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onStartEnroll() {
    setPending(true)
    setError(null)
    try {
      setEnroll(await startTwoFactorEnroll())
    } catch (err) {
      setError(problemDetail(err))
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
      await refresh()
    } catch (err) {
      setError(problemDetail(err))
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
      await refresh()
    } catch (err) {
      setError(problemDetail(err))
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
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPending(false)
    }
  }

  if (status === undefined) {
    return <p aria-live="polite">Comprobando…</p>
  }

  if (codes) {
    return (
      <RecoveryCodes
        codes={codes}
        onSaved={() => {
          setCodes(null)
          void refresh()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Seguridad</h1>
        <p className="text-sm text-slate-500">
          Protege tu cuenta con un segundo paso al iniciar sesión.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      {status === null || !status.enabled ? (
        enroll ? (
          <form className="space-y-4" onSubmit={onConfirmEnroll} noValidate>
            <h2 className="text-lg font-bold">Verificación en dos pasos</h2>
            <p className="text-sm text-slate-600">
              Ingresa esta clave en tu app de autenticación (o abre el enlace),
              luego confirma con el código de 6 dígitos.
            </p>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Clave manual</span>
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
                {copiedKey ? 'Clave copiada' : 'Copiar clave'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void copyText(enroll.uri).then((ok) => setCopiedUri(ok))
                }}
              >
                {copiedUri ? 'Enlace copiado' : 'Copiar enlace'}
              </Button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Código de 6 dígitos</span>
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
              {pending ? 'Verificando…' : 'Confirmar y activar'}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-bold">Verificación en dos pasos</h2>
            <p className="text-sm text-slate-600">
              Cada inicio de sesión pedirá además un código de 6 dígitos de tu app
              de autenticación. Recibirás códigos de recuperación por si pierdes el acceso.
            </p>
            <Button type="button" onClick={() => void onStartEnroll()} disabled={pending}>
              {pending ? 'Trabajando…' : 'Activar verificación en dos pasos'}
            </Button>
          </div>
        )
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Verificación en dos pasos</h2>
            <p className="text-sm text-slate-600">
              La verificación en dos pasos está activada para tu cuenta.
            </p>
          </section>
          <form className="space-y-3" onSubmit={onRegenerate} noValidate>
            <h3 className="font-semibold">Códigos de recuperación</h3>
            <p className="text-sm text-slate-600">
              Generar códigos nuevos invalida los anteriores.
            </p>
            {status.hasPassword ? (
              <label className="block max-w-sm space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Contraseña</span>
                <input
                  className={fieldClass}
                  type="password"
                  value={regenPassword}
                  onChange={(e) => setRegenPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            ) : null}
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? 'Trabajando…' : 'Generar códigos nuevos'}
            </Button>
          </form>
          <form className="space-y-3" onSubmit={onDisable} noValidate>
            <h3 className="font-semibold">Desactivar</h3>
            {status.hasPassword ? (
              <label className="block max-w-sm space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Contraseña</span>
                <input
                  className={fieldClass}
                  type="password"
                  required
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            ) : null}
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? 'Trabajando…' : 'Desactivar verificación en dos pasos'}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
