/**
 * Group event bus. Dependency-free and local-first so the group workspace can
 * stay in sync without a server round-trip.
 *
 * - `GROUP_UPDATED_EVENT`: the group entity itself changed (rename, branding…),
 *   used by `GroupWorkspace` to reload the shell.
 * - `GROUP_DATA_EVENT`: a slice of group data changed (a song/setlist/event/task/
 *   resource/member was created, edited or deleted). Mounted group surfaces
 *   subscribe so a creation dialog in one page immediately refreshes the others
 *   (ADR-0074 §3/§6). Broadcast across tabs when the platform supports it.
 */

export const GROUP_UPDATED_EVENT = 'sonivo:group-updated'

export function notifyGroupUpdated(): void {
  window.dispatchEvent(new Event(GROUP_UPDATED_EVENT))
}

export type GroupDataScope =
  | 'songs'
  | 'setlists'
  | 'events'
  | 'tasks'
  | 'resources'
  | 'members'
  | 'group'
  | 'all'

export type GroupDataDetail = { groupId: string | null; scope: GroupDataScope }

export const GROUP_DATA_EVENT = 'sonivo:group-data-changed'

const CROSS_TAB_KEY = 'sonivo:group-data-ping'

let channel: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  try {
    channel = new BroadcastChannel('sonivo:group-data')
  } catch {
    channel = null
  }
}

function isDetail(value: unknown): value is GroupDataDetail {
  if (!value || typeof value !== 'object') return false
  const detail = value as Partial<GroupDataDetail>
  return typeof detail.scope === 'string'
}

/** Broadcast that a group data slice changed. Same-tab listeners fire at once. */
export function notifyGroupDataChanged(scope: GroupDataScope, groupId?: string | null): void {
  const detail: GroupDataDetail = { groupId: groupId ?? null, scope }
  window.dispatchEvent(new CustomEvent<GroupDataDetail>(GROUP_DATA_EVENT, { detail }))
  try {
    if (channel) {
      channel.postMessage(detail)
    } else {
      // Fallback: the `storage` event only fires in *other* tabs, which is
      // exactly the cross-tab hop we want (same-tab already dispatched above).
      window.localStorage.setItem(CROSS_TAB_KEY, JSON.stringify({ ...detail, t: Date.now() }))
    }
  } catch {
    // Best-effort: cross-tab sync is a progressive enhancement.
  }
}

/**
 * Subscribe to group data changes (same-tab custom event + cross-tab broadcast).
 * Returns an unsubscribe function.
 */
export function subscribeGroupData(listener: (detail: GroupDataDetail) => void): () => void {
  function onWindow(event: Event) {
    const detail = (event as CustomEvent<unknown>).detail
    if (isDetail(detail)) listener(detail)
  }
  function onStorage(event: StorageEvent) {
    if (event.key !== CROSS_TAB_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue) as unknown
      if (isDetail(parsed)) listener(parsed)
    } catch {
      // ignore malformed payloads
    }
  }
  function onChannel(event: MessageEvent) {
    if (isDetail(event.data)) listener(event.data)
  }

  window.addEventListener(GROUP_DATA_EVENT, onWindow)
  window.addEventListener('storage', onStorage)
  channel?.addEventListener('message', onChannel)
  return () => {
    window.removeEventListener(GROUP_DATA_EVENT, onWindow)
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', onChannel)
  }
}
