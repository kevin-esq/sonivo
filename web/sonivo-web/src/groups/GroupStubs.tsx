import { useT, type I18nKey } from '../i18n'

/**
 * Interim section surfaces for the redesigned group IA (ADR-0055). Each wave
 * replaces one of these with the real screen; until then they render a titled,
 * honest empty state so navigation never 404s.
 */
function SectionStub({ titleKey }: { titleKey: I18nKey }) {
  const { t } = useT()
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">{t(titleKey)}</h1>
      <p className="text-sm text-muted">{t('seccion.comingSoon')}</p>
    </section>
  )
}

export function GroupSongsPage() {
  return <SectionStub titleKey="nav.songs" />
}

export function GroupLibraryPage() {
  return <SectionStub titleKey="nav.library" />
}

export function GroupCalendarPage() {
  return <SectionStub titleKey="nav.calendar" />
}

export function GroupTasksPage() {
  return <SectionStub titleKey="nav.tasks" />
}

export function GroupRolesPage() {
  return <SectionStub titleKey="nav.roles" />
}

export function GroupResourcesPage() {
  return <SectionStub titleKey="nav.resources" />
}

export function GroupFilesPage() {
  return <SectionStub titleKey="nav.files" />
}
