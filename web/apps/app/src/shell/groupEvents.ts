/**
 * Keeps the group bar (GroupWorkspace) in sync when the group itself changes
 * elsewhere, e.g. after a rename in Ajustes del grupo. Local, dependency-free.
 */
export const GROUP_UPDATED_EVENT = 'sonivo:group-updated'

export function notifyGroupUpdated(): void {
  window.dispatchEvent(new Event(GROUP_UPDATED_EVENT))
}
