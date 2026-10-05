import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { listMembers, type MemberListItem } from '../api/client'
import { useT } from '../i18n'
import { PageBreadcrumb } from '../repertoire/chrome'
import { useGroupContext, mutationErrorMessage, ProblemAlert } from '../repertoire/ui'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'

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
        granted ? 'bg-success/20 text-success' : 'bg-surface-hover text-muted',
      )}
    >
      {granted ? '✓' : '—'}
    </span>
  )
}

export function GroupRolesPage() {
  const { groupId } = useParams()
  const { t } = useT()
  const { group, error: groupError } = useGroupContext(groupId, '')
  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
  }, [groupId])

  if (group === undefined) {
    return <p aria-live="polite">{t('roles.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('workspace.myGroups')}
        </Link>
      </div>
    )
  }

  const memberCounts = new Map<string, number>()
  for (const member of members ?? []) {
    memberCounts.set(member.role, (memberCounts.get(member.role) ?? 0) + 1)
  }

  return (
    <section className="space-y-6" aria-labelledby="roles-heading">
      <header className="space-y-3">
        <PageBreadcrumb
          items={[
            { to: `/groups/${group.id}`, label: group.name },
            { label: t('roles.title') },
          ]}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-ink"
              aria-hidden="true"
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h1 id="roles-heading" className="text-3xl font-bold tracking-tight text-ink">
                {t('roles.title')}
              </h1>
              <p className="text-sm text-muted">{t('roles.subtitle')}</p>
            </div>
          </div>
          <Link to={`/groups/${group.id}/people`}>
            <Button variant="secondary">{t('roles.manageMembers')}</Button>
          </Link>
        </div>
      </header>

      <ProblemAlert message={error} />

      <div className="space-y-4">
        {ROLES.map((role) => (
          <div
            key={role.id}
            className="rounded-2xl border border-border-subtle bg-surface p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">{t(role.labelKey as never)}</h2>
                <p className="text-sm text-muted">{t(role.descriptionKey as never)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-hover px-3 py-1 text-sm font-medium text-muted">
                {memberCounts.get(role.id) ?? 0} {t('roles.memberCount')}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
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
      </div>
    </section>
  )
}
