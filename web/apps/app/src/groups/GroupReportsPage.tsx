import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BarChart3, CalendarDays, Music2 } from 'lucide-react'
import {
  getGroupEventResponseReport,
  getGroupRepertoireReport,
  getGroupSetlistUsageReport,
  getGroupTaskReport,
  groupEventResponseExportUrl,
  type GroupEventResponseReport,
  type GroupRepertoireReport,
  type GroupSetlistUsageReport,
  type GroupTaskReport,
} from '../api/reports'
import { ApiError } from '../api/http'
import { useT, type I18nKey } from '../i18n'
import { GroupButton, GroupErrorState, GroupPageHeader } from './ui'

const cardClass = 'rounded-2xl border border-border-subtle bg-surface p-5'
const purposeLabelKeys: Record<string, I18nKey> = {
  chart: 'resources.purposeChart',
  lyrics: 'resources.purposeLyrics',
  audio: 'resources.purposeAudio',
  click: 'resources.purposeClick',
  practice: 'resources.purposePractice',
  reference: 'resources.purposeReference',
  other: 'resources.purposeOther',
}

function Metric({ label, value }: { label: string; value: number }) {
  const { lang } = useT()
  return (
    <div className="rounded-xl bg-canvas p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value.toLocaleString(lang)}</p>
    </div>
  )
}

export function GroupReportsPage() {
  const { groupId } = useParams()
  const { t, lang } = useT()
  const [repertoire, setRepertoire] = useState<GroupRepertoireReport | null>(null)
  const [responses, setResponses] = useState<GroupEventResponseReport | null>(null)
  const [tasks, setTasks] = useState<GroupTaskReport | null>(null)
  const [setlistUsage, setSetlistUsage] = useState<GroupSetlistUsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'general' | 'forbidden' | null>(null)
  const [range, setRange] = useState(180)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const eventFrom = new Date()
    const eventTo = new Date(eventFrom)
    eventTo.setDate(eventTo.getDate() + range)
    const taskTo = new Date()
    const taskFrom = new Date(taskTo)
    taskFrom.setDate(taskFrom.getDate() - range)
    Promise.all([
      getGroupRepertoireReport(groupId),
      getGroupEventResponseReport(groupId, eventFrom, eventTo),
      getGroupTaskReport(groupId, taskFrom, taskTo),
      getGroupSetlistUsageReport(groupId),
    ])
      .then(([nextRepertoire, nextResponses, nextTasks, nextSetlistUsage]) => {
        if (cancelled) return
        setRepertoire(nextRepertoire)
        setResponses(nextResponses)
        setTasks(nextTasks)
        setSetlistUsage(nextSetlistUsage)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(reason instanceof ApiError && reason.status === 403 ? 'forbidden' : 'general')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [groupId, range, reload])

  const dateFormatter = new Intl.DateTimeFormat(lang, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

  if (loading) {
    return <div className="space-y-4" role="status" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-hover" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-surface-hover" />)}</div>
      <span className="sr-only">{t('reports.loading')}</span>
    </div>
  }

  if (error) {
    return <section className="space-y-4">
      <GroupPageHeader headingId="reports-heading" icon={BarChart3} title={t('reports.title')} subtitle={t('reports.subtitle')} />
      <GroupErrorState message={t(error === 'forbidden' ? 'reports.ownerOnly' : 'reports.error')} />
      {error === 'general' ? <GroupButton variant="soft" onClick={() => setReload((value) => value + 1)}>{t('reports.retry')}</GroupButton> : null}
    </section>
  }

  return (
    <section className="space-y-5" aria-labelledby="reports-heading">
      <GroupPageHeader headingId="reports-heading" icon={BarChart3} title={t('reports.title')} subtitle={t('reports.subtitle')} />

      {repertoire ? <section className={cardClass} aria-labelledby="reports-repertoire-heading">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary-ink"><Music2 size={19} aria-hidden="true" /></span>
          <div><h2 id="reports-repertoire-heading" className="font-semibold">{t('reports.repertoire')}</h2><p className="text-sm text-ink-muted">{t('reports.repertoireHelp')}</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t('reports.songs')} value={repertoire.songs} />
          <Metric label={t('reports.arrangements')} value={repertoire.arrangements} />
          <Metric label={t('reports.files')} value={repertoire.files} />
          <Metric label={t('reports.links')} value={repertoire.links} />
        </div>
        {repertoire.resourcesByPurpose.length > 0 ? <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">{t('reports.resourcesByPurpose')}</h3>
          <ul className="divide-y divide-border-subtle">
            {repertoire.resourcesByPurpose.map((item) => <li key={item.purpose} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
              <span>{purposeLabelKeys[item.purpose] ? t(purposeLabelKeys[item.purpose]) : t('resources.purposeOther')}</span>
              <span className="font-semibold tabular-nums">{item.count.toLocaleString(lang)}</span>
            </li>)}
          </ul>
        </div> : null}
      </section> : null}

      {responses ? <section className={`${cardClass} space-y-4`} aria-labelledby="reports-responses-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary-ink"><CalendarDays size={19} aria-hidden="true" /></span>
            <div><h2 id="reports-responses-heading" className="font-semibold">{t('reports.responses')}</h2><p className="text-sm text-ink-muted">{t('reports.responsesHelp')}</p></div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <span>{t('reports.period')}</span>
            <select value={range} onChange={(event) => setRange(Number(event.target.value))} className="min-h-11 rounded-lg border border-border-subtle bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-primary">
              <option value={30}>{t('reports.next30')}</option>
              <option value={90}>{t('reports.next90')}</option>
              <option value={180}>{t('reports.next180')}</option>
              <option value={365}>{t('reports.next365')}</option>
            </select>
          </label>
        </div>
        <a
          href={groupEventResponseExportUrl(groupId ?? '', new Date(responses.from), new Date(responses.to))}
          className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle px-3 text-sm font-semibold text-ink no-underline transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >{t('reports.exportCsv')}</a>
        <p className="text-sm text-ink-muted">{t('reports.memberCount', { count: responses.members })}</p>
        {responses.events.length === 0 ? <p className="rounded-xl bg-canvas p-4 text-sm text-ink-muted">{t('reports.noEvents')}</p> : (
          <ul className="divide-y divide-border-subtle">
            {responses.events.map((event) => <li key={event.eventId} className="grid grid-cols-2 gap-3 py-4 xl:grid-cols-[minmax(0,1fr)_repeat(4,minmax(5rem,auto))] xl:items-center">
              <div className="col-span-2 min-w-0 xl:col-span-1"><p className="break-words font-medium">{event.title}</p><p className="text-sm text-ink-muted">{dateFormatter.format(new Date(event.startsAt))}</p></div>
              <Metric label={t('reports.yes')} value={event.yes} />
              <Metric label={t('reports.no')} value={event.no} />
              <Metric label={t('reports.maybe')} value={event.maybe} />
              <Metric label={t('reports.noResponse')} value={event.noResponse} />
            </li>)}
          </ul>
        )}
      </section> : null}

      {tasks ? <section className={`${cardClass} space-y-4`} aria-labelledby="reports-tasks-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="reports-tasks-heading" className="font-semibold">{t('reports.tasks')}</h2><p className="text-sm text-ink-muted">{t('reports.tasksHelp')}</p></div>
          <span className="text-sm text-ink-muted">{t('reports.createdRange', { from: dateFormatter.format(new Date(tasks.from)), to: dateFormatter.format(new Date(tasks.to)) })}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t('reports.taskTotal')} value={tasks.total} />
          <Metric label={t('reports.taskOpen')} value={tasks.open} />
          <Metric label={t('reports.taskInProgress')} value={tasks.inProgress} />
          <Metric label={t('reports.taskDone')} value={tasks.done} />
          <Metric label={t('reports.taskUnassigned')} value={tasks.unassigned} />
          <Metric label={t('reports.taskOverdue')} value={tasks.overdue} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('reports.tasksByAssignee')}</h3>
          {tasks.byAssignee.length === 0 ? <p className="rounded-xl bg-canvas p-4 text-sm text-ink-muted">{t('reports.noTaskAssignments')}</p> : (
            <ul className="divide-y divide-border-subtle">
              {tasks.byAssignee.map((row) => <li key={row.userId} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                <span>{row.displayName || t('reports.unknownMember')}</span><span className="font-semibold tabular-nums">{row.count.toLocaleString(lang)}</span>
              </li>)}
            </ul>
          )}
        </div>
      </section> : null}

      {setlistUsage ? <section className={cardClass} aria-labelledby="reports-setlists-heading">
        <div className="mb-4"><h2 id="reports-setlists-heading" className="font-semibold">{t('reports.setlists')}</h2><p className="text-sm text-ink-muted">{t('reports.setlistsHelp', { date: dateFormatter.format(new Date(setlistUsage.asOf)) })}</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label={t('reports.currentSetlists')} value={setlistUsage.setlists} />
          <Metric label={t('reports.arrangementReferences')} value={setlistUsage.arrangementReferences} />
        </div>
      </section> : null}
    </section>
  )
}
