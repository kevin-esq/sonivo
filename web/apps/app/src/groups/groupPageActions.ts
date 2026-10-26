import { createInvitation, deleteGroup, leaveGroup, updateGroup } from '../api/client'
import type { GroupsPageActions } from './GroupsPage'
import { routes } from '../routing/routes'

/** Authenticated group list mutations. API authorization remains authoritative. */
export const groupsPageActions: GroupsPageActions = {
  onRename: async (group, name) => {
    await updateGroup(group.id, { name, expectedVersion: group.version })
  },
  onDelete: async (group) => {
    await deleteGroup(group.id, group.version)
  },
  onLeave: async (group) => {
    await leaveGroup(group.id)
  },
  onCreateInvite: async (group) => {
    const invitation = await createInvitation(group.id)
    return `${window.location.origin}${routes.joinInvitation(invitation.token)}`
  },
}
