import { Bell } from 'lucide-react'
import { Button } from '../../../ui/button'
import { useT } from '../../../i18n'
import { useGroupNotificationPreferences } from '../useGroupNotificationPreferences'

type GroupNotificationPreferencesPanelProps = {
  groupId: string | undefined
  active: boolean
}

export function GroupNotificationPreferencesPanel({
  groupId,
  active,
}: GroupNotificationPreferencesPanelProps) {
  const { t } = useT()
  const {
    preferences,
    setPreferences,
    loading,
    saving,
    error,
    saved,
    save,
  } = useGroupNotificationPreferences(groupId, active)

  if (!active) return null

  return (
    <section
      className="mx-auto max-w-xl rounded-3xl border border-border-subtle bg-surface px-6 py-8 sm:px-10"
      aria-labelledby="settings-notifications-title"
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-ink"
          aria-hidden="true"
        >
          <Bell className="h-6 w-6" />
        </span>
        <div>
          <h2 id="settings-notifications-title" className="text-xl font-semibold tracking-tight text-ink">
            {t('settings.tabNotifications')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('settings.notificationsSubtitle')}</p>
        </div>
      </div>

      {loading ? (
        <p aria-live="polite" className="mt-6 text-sm text-muted">
          {t('settings.notificationsLoading')}
        </p>
      ) : preferences ? (
        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle p-4">
            <input
              className="mt-1 h-4 w-4 accent-primary"
              type="checkbox"
              checked={preferences.notifyRoleChanges}
              onChange={(event) =>
                setPreferences({ ...preferences, notifyRoleChanges: event.target.checked })
              }
            />
            <span>
              <span className="block text-sm font-medium text-ink">{t('settings.notifyRoleChanges')}</span>
              <span className="mt-1 block text-sm text-muted">
                {t('settings.notifyRoleChangesDescription')}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle p-4">
            <input
              className="mt-1 h-4 w-4 accent-primary"
              type="checkbox"
              checked={preferences.notifyTaskAssignments}
              onChange={(event) =>
                setPreferences({ ...preferences, notifyTaskAssignments: event.target.checked })
              }
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                {t('settings.notifyTaskAssignments')}
              </span>
              <span className="mt-1 block text-sm text-muted">
                {t('settings.notifyTaskAssignmentsDescription')}
              </span>
            </span>
          </label>

          {saved ? <p role="status" className="text-sm text-muted">{t('settings.saved')}</p> : null}
          {error ? <p role="alert" className="text-sm text-error-ink">{error}</p> : null}
          <Button type="submit" disabled={saving}>
            {saving ? t('profile.saving') : t('settings.saveNotifications')}
          </Button>
        </form>
      ) : (
        <p role="alert" className="mt-6 text-sm text-error-ink">
          {error ?? t('common.errorGeneral')}
        </p>
      )}
    </section>
  )
}
