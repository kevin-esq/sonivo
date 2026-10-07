import { Button } from '../ui/button'
import { useT, type I18nKey } from '../i18n'
import type {
  ConductorConnectionState,
  ConductorPresenceEntry,
} from './useConductorRoom'

/** ADR-0036 Q9 conductor panel: presence + follow toggle + live/reconnect states. */

function connectionLabelKey(state: ConductorConnectionState): I18nKey | null {
  switch (state) {
    case 'connecting':
      return 'practica.live.connecting'
    case 'reconnecting':
      return 'practica.live.reconnecting'
    case 'disconnected':
      return 'practica.live.disconnected'
    case 'failed':
      return 'practica.live.offline'
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
  const { t } = useT()
  const stateLabel = connectionLabelKey(connectionState)

  return (
    <section
      className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4 sm:p-5 shadow-sm"
      aria-labelledby="conductor-heading"
      data-testid="conductor-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="conductor-heading"
          className="text-lg font-semibold tracking-tight text-ink"
        >
          {t('practica.live.title')}
        </h2>
        {isLive ? (
          <span
            className="rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-ink"
            data-testid="conductor-live-badge"
          >
            {t('practica.live.badge')}
          </span>
        ) : null}
      </div>

      <p
        className="text-sm text-muted"
        aria-live="polite"
        data-testid="conductor-connection-state"
      >
        {stateLabel
          ? t(stateLabel)
          : isOwner
            ? t('practica.live.broadcasting')
            : t('practica.live.connected')}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-error-ink" data-testid="conductor-error">
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
            {t('practica.live.follow')}
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-ink">
          {t('practica.live.inRoom', { count: presence.length })}
        </h3>
        {presence.length === 0 ? (
          <p className="text-sm text-muted">{t('practica.live.empty')}</p>
        ) : (
          <ul className="space-y-1" data-testid="conductor-presence">
            {presence.map((entry) => (
              <li
                key={entry.connectionId}
                className="text-sm text-ink"
                data-testid={`conductor-presence-${entry.userId}`}
              >
                {entry.displayName}
                {entry.role === 'owner' ? ` · ${t('practica.live.director')}` : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
