import { AppLink } from '../../../routing/AppLink'
import { useGroupShell } from '../../../shell/GroupShellContext'
import type { GroupUsage } from '../../../api/client'
import { routes } from '../../../routing/routes'
import { useT } from '../../../i18n'
import { formatBytes } from '../lib/groupSettingsModel'

type GroupPlanUsagePanelProps = {
  usage: GroupUsage | null
}

export function GroupPlanUsagePanel({ usage }: GroupPlanUsagePanelProps) {
  const { t } = useT()
  const { navigationMode } = useGroupShell()

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('settings.planTitle')}</h2>
      {usage ? (
        <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5">
          <p className="text-sm font-semibold text-ink">
            {usage.planId === 'starter'
              ? t('settings.planStarter')
              : usage.planId === 'pro'
                ? t('settings.planPro')
                : t('settings.planStudio')}
          </p>
          <div className="space-y-3">
            {[
              { key: 'members', label: t('settings.usageMembers'), metric: usage.members, bytes: false },
              { key: 'songs', label: t('settings.usageSongs'), metric: usage.songs, bytes: false },
              { key: 'setlists', label: t('settings.usageSetlists'), metric: usage.setlists, bytes: false },
              { key: 'events', label: t('settings.usageEvents'), metric: usage.eventsThisMonth, bytes: false },
              { key: 'storage', label: t('settings.usageStorage'), metric: usage.storageBytes, bytes: true },
            ].map((row) => (
              <div key={row.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink">{row.label}</span>
                  <span className="text-muted">
                    {row.metric.limit === null
                      ? t('settings.usageUnlimited')
                      : `${row.bytes ? formatBytes(row.metric.used) : row.metric.used} / ${
                          row.bytes ? formatBytes(row.metric.limit) : row.metric.limit
                        }`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="h-full rounded-full bg-primary-strong"
                    style={{
                      width:
                        row.metric.limit === null
                          ? '8%'
                          : `${Math.min(
                              100,
                              Math.round((row.metric.used / Math.max(1, row.metric.limit)) * 100),
                            )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <AppLink
            mode={navigationMode}
            to={routes.accountMembership}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-ink no-underline hover:underline"
          >
            {t('settings.changePlan')}
          </AppLink>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('settings.usageLoading')}</p>
      )}
    </div>
  )
}
