import { routes } from '../routing/routes'
import { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, CalendarDays, Music2, Search, Users, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useT } from '../i18n'

const guides = [
  { icon: Users, title: 'help.guide.groups.title', body: 'help.guide.groups.body', to: routes.groups, action: 'help.guide.groups.action' },
  { icon: Music2, title: 'help.guide.repertoire.title', body: 'help.guide.repertoire.body', to: routes.groups, action: 'help.guide.repertoire.action' },
  { icon: CalendarDays, title: 'help.guide.calendar.title', body: 'help.guide.calendar.body', to: routes.calendar, action: 'help.guide.calendar.action' },
  { icon: BookOpen, title: 'help.guide.people.title', body: 'help.guide.people.body', to: routes.groups, action: 'help.guide.people.action' },
] as const

const questions = [
  ['help.faq.group.question', 'help.faq.group.answer'],
  ['help.faq.repertoire.question', 'help.faq.repertoire.answer'],
  ['help.faq.invite.question', 'help.faq.invite.answer'],
  ['help.faq.roles.question', 'help.faq.roles.answer'],
] as const

export function HelpPage() {
  const { groupId } = useParams()
  const { t } = useT()
  const [query, setQuery] = useState('')
  const normalizedQuery = normalizeSearch(query)
  const groupGuides = [
    { icon: Music2, title: 'groupHelp.songs', body: 'groupHelp.songsBody', to: routes.groupLibrary(groupId ?? ''), action: 'groupHelp.openSongs' },
    { icon: BookOpen, title: 'groupHelp.setlists', body: 'groupHelp.setlistsBody', to: routes.groupSetlists(groupId ?? ''), action: 'groupHelp.openSetlists' },
    { icon: CalendarDays, title: 'groupHelp.tasks', body: 'groupHelp.tasksBody', to: routes.groupTasks(groupId ?? ''), action: 'groupHelp.openTasks' },
    { icon: Users, title: 'groupHelp.people', body: 'groupHelp.peopleBody', to: routes.groupPeople(groupId ?? ''), action: 'groupHelp.openPeople' },
  ] as const
  const visibleGuides = useMemo(
    () => (groupId ? groupGuides : guides).filter(({ title, body }) => matchesSearch(normalizedQuery, [t(title), t(body)])),
    [normalizedQuery, t, groupId],
  )
  const visibleQuestions = useMemo(
    () => questions.filter(([question, answer]) => (!groupId || question !== 'help.faq.group.question') && matchesSearch(normalizedQuery, [t(question), t(answer)])),
    [normalizedQuery, t, groupId],
  )

  return (
    <div className="help-page mx-auto max-w-5xl space-y-8">
      <header className="max-w-2xl space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t(groupId ? 'groupHelp.title' : 'help.title')}</h1>
        <p className="text-lg leading-7 text-muted">{t(groupId ? 'groupHelp.subtitle' : 'help.subtitle')}</p>
      </header>

      <div className="help-search">
        <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
        <label htmlFor="help-search" className="sr-only">{t('help.searchLabel')}</label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('help.searchPlaceholder')}
          className="min-h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('help.clearSearch')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {visibleGuides.length > 0 ? (
        <section aria-labelledby="help-guides-title" className="space-y-3">
          <h2 id="help-guides-title" className="text-xl font-semibold text-ink">{t('help.guidesTitle')}</h2>
          <ul className="help-guide-list">
            {visibleGuides.map(({ icon: Icon, title, body, to, action }) => (
              <li key={title} className="help-guide-row">
                <span className="help-guide-row__icon" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-semibold text-ink">{t(title)}</h3>
                  <p className="max-w-2xl text-sm leading-6 text-muted">{t(body)}</p>
                </div>
                <Link to={to} className="help-guide-row__action inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold text-primary-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {t(action)}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visibleQuestions.length > 0 ? (
        <section aria-labelledby="help-faq-title" className="space-y-3">
          <h2 id="help-faq-title" className="text-xl font-semibold text-ink">{t('help.faqTitle')}</h2>
          <div className="help-faq divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface px-4 sm:px-5">
            {visibleQuestions.map(([question, answer]) => (
              <details key={question} className="group py-3">
                <summary className="help-faq-summary min-h-12 cursor-pointer py-3 font-semibold text-ink marker:text-primary-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                  {t(question)}
                </summary>
                <p className="max-w-3xl pb-3 pr-2 text-sm leading-6 text-muted">{t(answer)}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {normalizedQuery && visibleGuides.length === 0 && visibleQuestions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-subtle px-5 py-8 text-center text-sm text-muted" role="status">
          {t('help.noSearchResults')}
        </p>
      ) : null}
    </div>
  )
}

function normalizeSearch(value: string): string {
  return value.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
}

function matchesSearch(query: string, values: string[]): boolean {
  return query.length === 0 || values.some((value) => normalizeSearch(value).includes(query))
}
