import { useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'
import { ensureCsrfToken } from '../api/http'

/**
 * Subscribes to the per-user notification hub (ADR-0077) and invokes `onSignal`
 * whenever the server pushes a new notification, so an inbox can refresh live
 * without a reload. Best effort: a failed connection never breaks the page.
 */
export function useNotificationsLive(onSignal: () => void): void {
  const handler = useRef(onSignal)
  handler.current = onSignal

  useEffect(() => {
    let cancelled = false
    let connection: signalR.HubConnection | null = null

    async function connect() {
      try {
        const token = await ensureCsrfToken()
        if (cancelled) return
        connection = new signalR.HubConnectionBuilder()
          .withUrl('/hubs/notifications', { headers: { 'X-CSRF-TOKEN': token } })
          .withAutomaticReconnect()
          .build()
        connection.on('NotificationCreated', () => handler.current())
        await connection.start()
      } catch {
        // Realtime is a progressive enhancement; the inbox still loads on open.
      }
    }

    void connect()
    return () => {
      cancelled = true
      void connection?.stop().catch(() => undefined)
    }
  }, [])
}
