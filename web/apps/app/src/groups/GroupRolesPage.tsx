import { routes } from '../routing/routes'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, ShieldCheck } from 'lucide-react'
import { listMembers, type MemberListItem } from '../api/client'
import { useT } from '../i18n'
import { useGroupContext, mutationErrorMessage } from '../repertoire/ui'
import { useGroupShell } from '../shell/GroupShellContext'
import { GroupRolesCenter } from './roles/GroupRolesCenter'
import {
  GroupButton,
  GroupErrorState,
  GroupLink,
  GroupPageHeader,
  GroupPageSkeleton,
  useGroupDataSignal,
} from './ui'

/**
 * "Roles & permissions" tab (ADR-0080): a two-column administration center.
 *
 * Everyone in the group can read the roles and their permission sets; only the
 * Owner sees the create/edit/duplicate/delete/assign actions, matching the
 * server-side authorization (role CRUD requires Owner).
 */
export function GroupRolesPage() {
  const { groupId } = useGroupShell()
  const { t } = useT()
  const { group, error: groupError, reload } = useGroupContext(groupId, '')
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [membersError, setMembersError] = useState<string | null>(null)
  const openCreate = useRef<(() => void) | null>(null)

  const loadMembers = useCallback(() => {
    if (!groupId) return
    void listMembers(groupId)
      .then((list) => {
        setMembers(list)
        setMembersError(null)
      })
      .catch((err) => setMembersError(mutationErrorMessage(err, t)))
  }, [groupId])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  useGroupDataSignal('members', groupId, loadMembers)

  if (group === undefined) {
    return <GroupPageSkeleton label={t('roles.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} onRetry={() => void reload()} />
        <GroupLink variant="soft" to={routes.groups}>
          {t('workspace.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const isOwner = group.role === 'Owner'

  return (
    <section className="space-y-6" aria-labelledby="roles-heading">
      <GroupPageHeader
        headingId="roles-heading"
        icon={ShieldCheck}
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        breadcrumb={[{ to: routes.group(group.id), label: group.name }, { label: t('roles.title') }]}
        actions={
          <>
            <GroupLink to={routes.groupPeople(group.id)} variant="secondary">
              {t('roles.manageMembers')}
            </GroupLink>
            {isOwner ? (
              <GroupButton type="button" onClick={() => openCreate.current?.()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('roles.create')}
              </GroupButton>
            ) : null}
          </>
        }
      />

      <GroupErrorState message={membersError} onRetry={loadMembers} />

      <GroupRolesCenter
        groupId={group.id}
        isOwner={isOwner}
        members={members}
        onMembersChanged={loadMembers}
        registerCreate={(open) => {
          openCreate.current = open
        }}
      />
    </section>
  )
}
