import { PlugZap } from 'lucide-react'
import { useT } from '../../../i18n'

type GroupIntegrationsPanelProps = {
  groupId: string
}

export function GroupIntegrationsPanel({ groupId }: GroupIntegrationsPanelProps) {
  const { t } = useT()

  return (
    <section
      className="mx-auto max-w-xl rounded-3xl border border-border-subtle bg-surface px-6 py-8 sm:px-10"
      aria-labelledby="settings-integrations-title"
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-ink"
          aria-hidden="true"
        >
          <PlugZap className="h-6 w-6" />
        </span>
        <div>
          <h2 id="settings-integrations-title" className="text-xl font-semibold tracking-tight text-ink">
            {t('settings.tabIntegrations')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('settings.calendarIntegrationTitle')}</p>
        </div>
      </div>
      <p className="mt-5 text-sm leading-6 text-muted">{t('settings.calendarIntegrationHelp')}</p>
      <a
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        href={`/api/groups/${groupId}/calendar.ics`}
        download="sonivo-calendar.ics"
      >
        {t('settings.calendarDownload')}
      </a>
    </section>
  )
}
