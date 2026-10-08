import { useEffect } from 'react'
import * as signalR from '@microsoft/signalr'
import { ensureCsrfToken } from '../api/client'
import { notifyGroupDataChanged, type GroupDataScope } from '../shell/groupEvents'

type GroupChangedMessage = { groupId?: string; scope?: string }

/**
 * Cross-user real time (ADR-0074 §3/§6): connects to the group's SignalR hub and,
 * on every `GroupChanged` broadcast, republishes it on the in-app bus so the
 * already-mounted group surfaces (`useGroupDataSignal`) refetch the slice. The
 * connection is best-effort: a failure never blocks the page, and reconnect is
 * automatic.
 */
export function useGroupLive(groupId: string | undefined) {
  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    let connection: signalR.HubConnection | null = null

    async function connect() {
      try {
        // The /hubs/group/negotiate POST is an unsafe method → CSRF header.
        const token = await ensureCsrfToken()
        if (cancelled) return
        connection = new signalR.HubConnectionBuilder()
          .withUrl('/hubs/group', { headers: { 'X-CSRF-TOKEN': token } })
          .withAutomaticReconnect()
          .build()

        connection.on('GroupChanged', (message: GroupChangedMessage) => {
          if (cancelled || !message) return
          if (message.groupId && message.groupId !== groupId) return
          notifyGroupDataChanged((message.scope as GroupDataScope) ?? 'all', groupId)
        })

        // Re-join after a reconnect (group membership is per connection).
        connection.onreconnected(() => {
          void connection?.invoke('JoinGroup', groupId).catch(() => undefined)
        })

        await connection.start()
        if (cancelled) return
        await connection.invoke('JoinGroup', groupId)
      } catch {
        // Best-effort: real time is progressive enhancement.
      }
    }

    void connect()

    return () => {
      cancelled = true
      const stopping = connection
      connection = null
      if (stopping) {
        stopping
          .invoke('LeaveGroup', groupId)
          .catch(() => undefined)
          .finally(() => {
            void stopping.stop().catch(() => undefined)
          })
      }
    }
  }, [groupId])
}
