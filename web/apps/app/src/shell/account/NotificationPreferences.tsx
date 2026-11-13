'use client'

import { useEffect, useState } from 'react'
import { Bell, Check, LoaderCircle } from 'lucide-react'
import { listMyGroups, type GroupSummary } from '../../api/client'
import { getGroupNotificationPreferences, updateGroupNotificationPreferences, type GroupNotificationPreferences } from '../../api/groups'
import { useT } from '../../i18n'
import { AccountCard } from './AccountCard'

export function NotificationPreferences() {
  const { t } = useT()
  const [groups, setGroups] = useState<Array<{ group: GroupSummary; preferences: GroupNotificationPreferences }> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void listMyGroups().then(async (items) => {
      const results = await Promise.all(items.map(async (group) => ({ group, preferences: await getGroupNotificationPreferences(group.id) })))
      if (active) setGroups(results)
    }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function toggle(groupId: string, key: keyof GroupNotificationPreferences, value: boolean) {
    if (!groups || saving) return
    const current = groups.find((item) => item.group.id === groupId)
    if (!current) return
    const next = { ...current.preferences, [key]: value }
    setSaving(`${groupId}:${key}`)
    setError(false)
    try {
      await updateGroupNotificationPreferences(groupId, next)
      setGroups((items) => items?.map((item) => item.group.id === groupId ? { ...item, preferences: next } : item) ?? null)
    } catch { setError(true) } finally { setSaving(null) }
  }

  return <AccountCard title={t('account.notificationPreferences')}>
    <div className="space-y-3">
      <p className="text-sm text-muted">{t('account.notificationPreferencesHint')}</p>
      {error ? <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error-ink">{t('account.preferencesSaveError')}</p> : null}
      {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{t('plans.loading')}</p>
        : groups?.length ? <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {groups.map(({ group, preferences }) => <li key={group.id} className="space-y-2 p-3 sm:p-4">
            <h3 className="truncate text-sm font-semibold text-ink">{group.name}</h3>
            <PreferenceToggle label={t('account.roleChangeNotices')} checked={preferences.notifyRoleChanges} disabled={saving !== null} busy={saving === `${group.id}:notifyRoleChanges`} onChange={(value) => void toggle(group.id, 'notifyRoleChanges', value)} />
            <PreferenceToggle label={t('account.taskAssignmentNotices')} checked={preferences.notifyTaskAssignments} disabled={saving !== null} busy={saving === `${group.id}:notifyTaskAssignments`} onChange={(value) => void toggle(group.id, 'notifyTaskAssignments', value)} />
          </li>)}
        </ul> : <p className="rounded-xl border border-border-subtle bg-canvas px-3 py-4 text-sm text-muted">{t('account.noNotificationGroups')}</p>}
      <p className="text-xs text-muted">{t('account.securityNoticesAlways')}</p>
    </div>
  </AccountCard>
}

function PreferenceToggle({ label, checked, disabled, busy, onChange }: { label: string; checked: boolean; disabled: boolean; busy: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex min-h-11 items-center justify-between gap-3">
    <span className="text-sm text-ink">{label}</span>
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 motion-reduce:transition-none ${checked ? 'bg-primary' : 'bg-surface-hover'}`}>
      <span className={`grid size-5 place-items-center rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${checked ? 'translate-x-6' : 'translate-x-1'}`}>{busy ? <LoaderCircle className="size-3 animate-spin text-primary-ink" aria-hidden="true" /> : checked ? <Check className="size-3 text-primary-ink" aria-hidden="true" /> : null}</span>
    </button>
  </div>
}
