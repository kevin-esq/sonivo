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

const fieldClass = 'w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'

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
      onStatusChanged()
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
      onStatusChanged()
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
      onStatusChanged()
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {status === null || !status.enabled ? (
        enroll ? (
          <form className="space-y-4 max-w-lg" onSubmit={onConfirmEnroll} noValidate>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Verificación en dos pasos</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Ingresa esta clave en tu app de autenticación (o escanea el código QR a continuación):
            </p>
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
              <QRCodeSVG value={enroll.uri} size={180} level="M" className="rounded-lg border bg-white p-2 shadow-sm" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Código QR para aplicación de autenticación</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Clave manual</span>
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
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Código de 6 dígitos</span>
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
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Verificación en dos pasos</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
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
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Verificación en dos pasos</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              La verificación en dos pasos está activada para tu cuenta.
            </p>
          </div>
          <form className="space-y-3 max-w-md" onSubmit={onRegenerate} noValidate>
            <h3 className="font-semibold text-slate-900 dark:text-white">Códigos de recuperación</h3>
            {status.hasPassword ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña para regenerar</span>
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
              {pending ? 'Generando…' : 'Generar nuevos códigos de recuperación'}
            </Button>
          </form>

          <form className="space-y-3 max-w-md pt-4 border-t border-slate-200 dark:border-slate-800" onSubmit={onDisable} noValidate>
            <h3 className="font-semibold text-red-600 dark:text-red-400">Desactivar 2FA</h3>
            {status.hasPassword ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña</span>
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
              {pending ? 'Desactivando…' : 'Desactivar verificación en dos pasos'}
            </Button>
          </form>
        </div>
      )}

      {codes ? (
        <section
          aria-label="Códigos de recuperación"
          role="region"
          className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4 mt-6"
        >
          <h3 className="font-semibold text-primary">Guarda estos códigos de recuperación</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Se muestran una sola vez. Si pierdes el teléfono, necesitarás uno para entrar.
          </p>
          <ul className="grid grid-cols-2 gap-2 text-center font-mono text-sm">
            {codes.map((code) => (
              <li key={code} className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-primary/25 text-slate-900 dark:text-white">
                {code}
              </li>
            ))}
          </ul>
          <Button type="button" onClick={() => setCodes(null)}>
            He guardado mis códigos
          </Button>
        </section>
      ) : null}
    </section>
  )
}
