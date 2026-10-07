import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckSquare, ListMusic, Music2 } from 'lucide-react'
import {
  listEvents,
  listSetlists,
  listTasks,
  type EventListItem,
  type SetlistListItem,
  type TaskItem,
} from '../api/client'
import { useT } from '../i18n'
import { cn } from '../ui/cn'
import { addDays, dayKey, isSameDay, startOfWeek, timeLabel, weekdayShort } from '../calendar/calendarUtils'
import { plural } from '../ui/plural'
import { GroupCard, GroupChip, GroupIconWell, GroupLink, useGroupDataSignal } from '../groups/ui'

/**
 * Persistent right-hand context rail for the group workspace (owner reference
 * 2026-10-07): "Your week", "Today", "Your setlists" and "Your progress". Hidden below
 * xl so the main content keeps full width on smaller screens.
 */
export function GroupContextRail({ groupId }: { groupId: string }) {
  const { t, lang } = useT()
  const [events, setEvents] = useState<EventListItem[]>([])
  const [setlists, setSetlists] = useState<SetlistListItem[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void Promise.all([listEvents(groupId), listSetlists(groupId), listTasks(groupId)])
      .then(([eventItems, setlistItems, taskItems]) => {
        if (cancelled) return
        setEvents(eventItems)
        setSetlists(setlistItems)
        setTasks(taskItems)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [groupId, reloadKey])

  useGroupDataSignal(['events', 'setlists', 'tasks'], groupId, () =>
    setReloadKey((key) => key + 1),
  )

  const today = useMemo(() => new Date(), [reloadKey])
  const week = useMemo(() => {
    const monday = startOfWeek(today)
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
  }, [today])
  const eventDays = useMemo(() => new Set(events.map((event) => dayKey(new Date(event.startsAt)))), [events])
  const todayEvents = useMemo(
    () =>
      events
        .filter((event) => event.status === 'scheduled' && isSameDay(new Date(event.startsAt), today))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [events, today],
  )
  const doneTasks = tasks.filter((task) => task.status === 'done').length
  const progress = tasks.length === 0 ? 0 : Math.round((doneTasks / tasks.length) * 100)
  const topSetlists = setlists.slice(0, 4)

  return (
    <aside className="hidden w-[22rem] shrink-0 space-y-4 xl:block" aria-label={t('nav.sectionOrganization')}>
      {/* Tu semana */}
      <GroupCard className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">{t('calendario.week')}</h2>
          <GroupLink variant="ghost" size="sm" to={`/groups/${groupId}/calendario`}>
            {t('calendario.viewFull')}
          </GroupLink>
        </div>
        <ol className="grid grid-cols-7 gap-1">
          {week.map((day) => {
            const active = isSameDay(day, today)
            const hasEvent = eventDays.has(dayKey(day))
            return (
              <li key={dayKey(day)}>
                <Link
                  to={`/groups/${groupId}/calendario`}
                  aria-current={active ? 'date' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    active
                      ? 'border-transparent bg-primary-strong text-primary-foreground shadow-sm'
                      : 'border-border-subtle bg-surface text-ink hover:bg-surface-hover',
                  )}
                >
                  <span className={cn('text-[10px] uppercase', active ? 'text-primary-foreground/80' : 'text-muted')}>
                    {weekdayShort(day, lang).slice(0, 3)}
                  </span>
                  <span className="text-sm font-semibold">{day.getDate()}</span>
                  <span
                    className={cn(
                      'h-1 w-1 rounded-full',
                      hasEvent ? (active ? 'bg-primary-foreground' : 'bg-primary-ink') : 'bg-transparent',
                    )}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            )
          })}
        </ol>
      </GroupCard>

      {/* Hoy */}
      <GroupCard className="space-y-3">
        <h2 className="font-display text-base font-semibold text-ink">{t('rail.today')}</h2>
        {todayEvents.length === 0 ? (
          <p className="text-sm text-muted">{t('rail.nothingToday')}</p>
        ) : (
          <ul className="space-y-2">
            {todayEvents.map((event) => (
              <li key={event.id}>
                <Link
                  to={`/groups/${groupId}/events/${event.id}`}
                  className="flex items-center gap-3 rounded-xl px-1 py-1.5 no-underline transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <GroupIconWell icon={CalendarDays} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{event.title}</span>
                    <span className="block truncate text-xs text-muted">{timeLabel(event.startsAt, lang)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GroupCard>

      {/* Tus listas */}
      <GroupCard className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">{t('nav.setlists')}</h2>
          <GroupLink variant="ghost" size="sm" to={`/groups/${groupId}/setlists`}>
            {t('inicio.viewAll')}
          </GroupLink>
        </div>
        {topSetlists.length === 0 ? (
          <p className="text-sm text-muted">{t('rail.noSetlists')}</p>
        ) : (
          <ul className="space-y-2">
            {topSetlists.map((setlist) => (
              <li key={setlist.id}>
                <Link
                  to={`/groups/${groupId}/setlists/${setlist.id}`}
                  className="flex items-center gap-3 rounded-xl px-1 py-1.5 no-underline transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <GroupIconWell icon={ListMusic} size="sm" tone="neutral" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{setlist.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {plural(setlist.itemCount, t('rail.songOne'), t('rail.songMany'))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GroupCard>

      {/* Tu progreso */}
      <GroupCard className="space-y-3">
        <h2 className="font-display text-base font-semibold text-ink">{t('rail.progress')}</h2>
        <div className="flex items-center gap-4">
          <ProgressRing value={progress} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-ink">
              {doneTasks}/{tasks.length || 0} {t('rail.tasks')}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            {tasks.length > 0 && doneTasks === tasks.length ? (
              <p className="flex items-center gap-1 text-xs text-success-ink">
                <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                {t('rail.greatJob')}
              </p>
            ) : (
              <p className="flex items-center gap-1 text-xs text-muted">
                <Music2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('rail.keepGoing')}
              </p>
            )}
          </div>
        </div>
      </GroupCard>
    </aside>
  )
}

function ProgressRing({ value }: { value: number }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference
  return (
    <span className="relative grid h-16 w-16 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="6" className="stroke-[var(--color-surface-hover)]" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-[var(--color-primary)] transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-sm font-semibold text-ink">{value}%</span>
    </span>
  )
}
