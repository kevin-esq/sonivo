import { ensureCsrfToken } from '../api/http'

export type ClientErrorPayload = {
  /** Where the error came from: 'window.error', 'unhandledrejection', 'react'. */
  source: string
  message: string
  stack?: string | null
  url?: string
}

/**
 * Best-effort client error reporting (observability). Never throws and never
 * blocks: the app must keep working even when reporting fails (offline, 401,
 * rate-limited). The server truncates and logs; nothing is persisted.
 */
export function reportClientError(payload: ClientErrorPayload): void {
  void (async () => {
    try {
      const token = await ensureCsrfToken()
      await fetch('/api/client-errors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        body: JSON.stringify({
          source: payload.source,
          message: payload.message.slice(0, 500),
          stack: payload.stack ? payload.stack.slice(0, 4000) : null,
          url: payload.url ?? window.location.href,
          userAgent: navigator.userAgent,
          at: new Date().toISOString(),
        }),
        keepalive: true,
      })
    } catch {
      // Reporting is a convenience; swallow everything.
    }
  })()
}

/**
 * Captures uncaught errors and unhandled rejections for the current session.
 * Returns an unsubscribe function. Idempotent enough to call once per app mount.
 */
export function installGlobalErrorHandlers(): () => void {
  function onError(event: ErrorEvent) {
    reportClientError({
      source: 'window.error',
      message: event.message || 'Unknown error',
      stack: event.error instanceof Error ? event.error.stack : null,
    })
  }

  function onRejection(event: PromiseRejectionEvent) {
    const reason: unknown = event.reason
    const message =
      typeof reason === 'string'
        ? reason
        : reason instanceof Error
          ? reason.message
          : String(reason)
    reportClientError({
      source: 'unhandledrejection',
      message,
      stack: reason instanceof Error ? reason.stack : null,
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
