import { Button } from '../ui/button'
import type {
  ConductorConnectionState,
  ConductorPresenceEntry,
} from './useConductorRoom'

/** ADR-0036 Q9 conductor panel: presence + follow toggle + live/reconnect states. */

function connectionLabel(state: ConductorConnectionState): string | null {
  switch (state) {
    case 'connecting':
      return 'Conectando…'
    case 'reconnecting':
      return 'Reconectando…'
    case 'disconnected':
      return 'Desconectado'
    case 'failed':
      return 'Sin conexión en vivo'
    case 'connected':
      return null
  }
}

export function ConductorPanel({
  presence,
  connectionState,
  isOwner,
  followEnabled,
  onToggleFollow,
  isLive,
  error,
}: {
  presence: ConductorPresenceEntry[]
  connectionState: ConductorConnectionState
  isOwner: boolean
  followEnabled: boolean
  onToggleFollow: () => void
  isLive: boolean
  error: string | null
}) {
  const stateLabel = connectionLabel(connectionState)

  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      aria-labelledby="conductor-heading"
      data-testid="conductor-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="conductor-heading"
          className="text-lg font-semibold tracking-tight text-neutral-dark"
        >
          Ensayo en vivo
        </h2>
        {isLive ? (
          <span
            className="rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-neutral-dark"
            data-testid="conductor-live-badge"
          >
            En vivo
          </span>
        ) : null}
      </div>

      <p
        className="text-sm text-slate-600"
        aria-live="polite"
        data-testid="conductor-connection-state"
      >
        {stateLabel ?? (isOwner ? 'Transmitiendo como director.' : 'Conectado a la sala.')}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-error" data-testid="conductor-error">
          {error}
        </p>
      ) : null}

      {!isOwner ? (
        <div>
          <Button
            type="button"
            variant={followEnabled ? 'primary' : 'secondary'}
            size="sm"
            data-testid="conductor-follow-toggle"
            aria-pressed={followEnabled}
            onClick={onToggleFollow}
          >
            Seguir al director
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-slate-800">
          En la sala ({presence.length})
        </h3>
        {presence.length === 0 ? (
          <p className="text-sm text-slate-600">Aún no hay nadie en la sala.</p>
        ) : (
          <ul className="space-y-1" data-testid="conductor-presence">
            {presence.map((entry) => (
              <li
                key={entry.connectionId}
                className="text-sm text-slate-700"
                data-testid={`conductor-presence-${entry.userId}`}
              >
                {entry.displayName}
                {entry.role === 'owner' ? ' · Director' : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
