import { useCallback, useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { ensureCsrfToken } from '../api/client'

/** ADR-0036 Q9 conductor room client. Position broadcast only — no audio transport. */

export type ConductorPresenceEntry = {
  connectionId: string
  userId: string
  displayName: string
  role: string
}

export type ConductorPositionMessage = {
  arrangementId: string
  positionMs: number
  playing: boolean
  conductorUserId: string
  conductorName: string
  at: string
}

export type ConductorConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed'

export type ConductorLastPosition = {
  position: ConductorPositionMessage
  receivedAt: number
}

function hubErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'No se pudo unir a la sala en vivo.'
}

export function useConductorRoom(eventId: string | null) {
  const [connectionState, setConnectionState] =
    useState<ConductorConnectionState>('disconnected')
  const [presence, setPresence] = useState<ConductorPresenceEntry[]>([])
  const [lastPosition, setLastPosition] = useState<ConductorLastPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const connectionRef = useRef<signalR.HubConnection | null>(null)
  const eventRef = useRef<string | null>(null)
  eventRef.current = eventId

  useEffect(() => {
    if (!eventId) {
      setConnectionState('disconnected')
      setPresence([])
      setLastPosition(null)
      setError(null)
      return
    }

    let cancelled = false
    let connection: signalR.HubConnection | null = null
    setConnectionState('connecting')
    setError(null)
    setLastPosition(null)

    async function connect() {
      // Q9-Q3: X-CSRF-TOKEN is required on the /negotiate POST. The JS client
      // sends `headers` with its HTTP (negotiate) requests — never on the socket.
      const token = await ensureCsrfToken()
      if (cancelled) return
      connection = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/practiceroom', { headers: { 'X-CSRF-TOKEN': token } })
        .withAutomaticReconnect()
        .build()
      connectionRef.current = connection
      connection.on('PresenceUpdate', (list: ConductorPresenceEntry[] | null) => {
        if (!cancelled) setPresence(Array.isArray(list) ? list : [])
      })
      connection.on('PositionUpdate', (position: ConductorPositionMessage) => {
        if (!cancelled) setLastPosition({ position, receivedAt: Date.now() })
      })
      connection.onreconnecting(() => {
        if (!cancelled) setConnectionState('reconnecting')
      })
      connection.onreconnected(() => {
        if (!cancelled) setConnectionState('connected')
      })
      connection.onclose(() => {
        if (!cancelled) setConnectionState('disconnected')
      })
      try {
        await connection.start()
        if (cancelled) return
        const initial = (await connection.invoke('JoinRoom', eventId)) as
          | ConductorPresenceEntry[]
          | null
        if (cancelled) return
        if (Array.isArray(initial)) setPresence(initial)
        setConnectionState('connected')
      } catch (err) {
        if (cancelled) return
        setError(hubErrorMessage(err))
        setConnectionState('failed')
      }
    }

    void connect()

    return () => {
      cancelled = true
      const stopping = connection
      connectionRef.current = null
      if (stopping) {
        stopping
          .invoke('LeaveRoom', eventId)
          .catch(() => undefined)
          .finally(() => {
            void stopping.stop().catch(() => undefined)
          })
      }
    }
  }, [eventId])

  const sendPosition = useCallback(
    (arrangementId: string, positionMs: number, playing: boolean) => {
      const connection = connectionRef.current
      const currentEvent = eventRef.current
      if (!connection || !currentEvent) return
      // Q9-Q1: client sends at most 1 Hz (the caller paces the interval);
      // the server additionally drops anything inside its 900 ms gap.
      void connection
        .invoke('BroadcastPosition', {
          eventId: currentEvent,
          arrangementId,
          positionMs,
          playing,
        })
        .catch(() => undefined)
    },
    [],
  )

  return { connectionState, presence, lastPosition, error, sendPosition }
}
