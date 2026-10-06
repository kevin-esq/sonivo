import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { listMembers, type MemberListItem } from '../api/client'
import { useT } from '../i18n'
import { useGroupContext, mutationErrorMessage } from '../repertoire/ui'
import { cn } from '../ui/cn'
import {
  GroupButton,
  GroupCard,
  GroupChip,
  GroupErrorState,
  GroupLink,
  GroupPageHeader,
  GroupPageSkeleton,
  useGroupDataSignal,
} from './ui'

type RoleInfo = {
  id: string
  labelKey: string
  descriptionKey: string
}

const ROLES: RoleInfo[] = [
  { id: 'Owner', labelKey: 'roles.roleOwner', descriptionKey: 'roles.roleOwnerDesc' },
  { id: 'Manager', labelKey: 'roles.roleManager', descriptionKey: 'roles.roleManagerDesc' },
  { id: 'Member', labelKey: 'roles.roleMember', descriptionKey: 'roles.roleMemberDesc' },
  { id: 'Viewer', labelKey: 'roles.roleViewer', descriptionKey: 'roles.roleViewerDesc' },
]

type Permission = {
  key: string
  labelKey: string
  roles: string[]
}

const PERMISSIONS: Permission[] = [
  { key: 'manage_group', labelKey: 'roles.permManageGroup', roles: ['Owner'] },
  { key: 'manage_branding', labelKey: 'roles.permManageBranding', roles: ['Owner'] },
  { key: 'manage_members', labelKey: 'roles.permManageMembers', roles: ['Owner'] },
  { key: 'manage_content', labelKey: 'roles.permManageContent', roles: ['Owner', 'Manager'] },
  { key: 'manage_setlists', labelKey: 'roles.permManageSetlists', roles: ['Owner', 'Manager'] },
  { key: 'manage_events', labelKey: 'roles.permManageEvents', roles: ['Owner', 'Manager'] },
  { key: 'manage_tasks', labelKey: 'roles.permManageTasks', roles: ['Owner', 'Manager'] },
  { key: 'rsvp_events', labelKey: 'roles.permRsvpEvents', roles: ['Owner', 'Manager', 'Member'] },
  { key: 'practice', labelKey: 'roles.permPractice', roles: ['Owner', 'Manager', 'Member'] },
  { key: 'view_content', labelKey: 'roles.permViewContent', roles: ['Owner', 'Manager', 'Member', 'Viewer'] },
]

function PermissionCell({ granted }: { granted: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
        granted ? 'bg-success/20 text-success-ink' : 'bg-surface-hover text-muted',
      )}
    >
      {granted ? '✓' : '—'}
    </span>
  )
}

export function GroupRolesPage() {
  const { groupId } = useParams()
  const { t } = useT()
  const { group, error: groupError, reload } = useGroupContext(groupId, '')
  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadMembers() {
    if (!groupId) return
    let cancelled = false
    listMembers(groupId)
      .then((list) => {
        if (!cancelled) setMembers(list)
      })
      .catch((err) => {
        if (!cancelled) setError(mutationErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }

  useEffect(loadMembers, [groupId])

  // Live refresh when members change elsewhere (invite, role change, leave).
  useGroupDataSignal('members', groupId, () => {
    setError(null)
    void loadMembers()
  })

  if (group === undefined) {
    return <GroupPageSkeleton label={t('roles.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState
          message={groupError}
          onRetry={() => void reload()}
        />
        <GroupLink variant="soft" to="/grupos">
          {t('workspace.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const memberCounts = new Map<string, number>()
  for (const member of members ?? []) {
    memberCounts.set(member.role, (memberCounts.get(member.role) ?? 0) + 1)
  }

  return (
    <section className="space-y-6" aria-labelledby="roles-heading">
      <GroupPageHeader
        headingId="roles-heading"
        icon={ShieldCheck}
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        breadcrumb={[{ to: `/groups/${group.id}`, label: group.name }, { label: t('roles.title') }]}
        actions={
          <GroupLink to={`/groups/${group.id}/people`} variant="secondary">
            {t('roles.manageMembers')}
          </GroupLink>
        }
      />

      <GroupErrorState message={error} />

      <div className="space-y-4">
        {ROLES.map((role) => (
          <GroupCard key={role.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink">{t(role.labelKey as never)}</h2>
              <p className="text-sm text-muted">{t(role.descriptionKey as never)}</p>
            </div>
            <GroupChip tone="neutral" className="shrink-0 px-3 py-1">
              {memberCounts.get(role.id) ?? 0} {t('roles.memberCount')}
            </GroupChip>
          </GroupCard>
        ))}
      </div>

      <GroupCard padding="none" className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left font-semibold text-ink">{t('roles.permission')}</th>
              {ROLES.map((role) => (
                <th key={role.id} className="px-4 py-3 text-center font-semibold text-ink">
                  {t(role.labelKey as never)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((perm) => (
              <tr key={perm.key} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 text-ink">{t(perm.labelKey as never)}</td>
                {ROLES.map((role) => (
                  <td key={role.id} className="px-4 py-3 text-center">
                    <PermissionCell granted={perm.roles.includes(role.id)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </GroupCard>
    </section>
  )
}
