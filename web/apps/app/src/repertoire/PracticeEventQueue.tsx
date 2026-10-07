import { Link } from 'react-router-dom'
import type { EventPlanItem } from '../api/client'
import { useT } from '../i18n'
import { buttonVariants } from '../ui/button'
import { cn } from '../ui/cn'

export function practiceQueueHref(
  groupId: string,
  eventId: string,
  item: EventPlanItem,
): string {
  const params = new URLSearchParams({ eventId, item: item.id })
  return `/groups/${groupId}/arrangements/${item.arrangementId}/practice?${params.toString()}`
}

const navLinkClass = cn(
  buttonVariants({ variant: 'secondary', size: 'default' }),
  'min-h-11 min-w-[7.5rem] no-underline',
)
const navDisabledClass = cn(navLinkClass, 'pointer-events-none opacity-50')

export function PracticeEventQueue({
  groupId,
  eventId,
  eventTitle,
  items,
  currentItemId,
}: {
  groupId: string
  eventId: string
  eventTitle: string
  items: EventPlanItem[]
  currentItemId: string | null
}) {
  const indexByItem =
    currentItemId != null ? items.findIndex((item) => item.id === currentItemId) : -1
  const { t } = useT()
  const currentIndex = indexByItem >= 0 ? indexByItem : 0
  const current = items[currentIndex]
  const prev = currentIndex > 0 ? items[currentIndex - 1] : null
  const next = currentIndex < items.length - 1 ? items[currentIndex + 1] : null

  if (!current) return null

  return (
    <section
      className="space-y-4 rounded-xl border border-border-subtle bg-surface-hover p-4 sm:p-5"
      aria-labelledby="practice-queue-heading"
      data-testid="practice-queue"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          {t('queue.title')}
        </p>
        <h2 id="practice-queue-heading" className="text-lg font-semibold tracking-tight text-ink">
          {eventTitle}
        </h2>
        <p className="text-sm text-muted" aria-live="polite">
          {t('queue.songPrefix')}{currentIndex + 1}{t('queue.songMiddle')}{items.length}
        </p>
      </div>

      <div className="space-y-0.5">
        <p
          className="text-base font-semibold text-ink"
          data-testid="practice-queue-song-title"
        >
          {current.displaySongTitle}
        </p>
        <p className="text-sm text-ink" data-testid="practice-queue-arrangement-label">
          {current.displayArrangementLabel}
        </p>
      </div>

      <div className="flex flex-wrap gap-3" role="group" aria-label={t('queue.navLabel')}>
        {prev ? (
          <Link
            className={navLinkClass}
            to={practiceQueueHref(groupId, eventId, prev)}
            aria-label={`${t('queue.prevPrefix')}${prev.displaySongTitle}`}
            data-testid="practice-queue-prev"
          >
            {t('queue.prev')}
          </Link>
        ) : (
          <span
            className={navDisabledClass}
            aria-disabled="true"
            aria-label={t('queue.prevDisabled')}
            data-testid="practice-queue-prev"
          >
            {t('queue.prev')}
          </span>
        )}
        {next ? (
          <Link
            className={navLinkClass}
            to={practiceQueueHref(groupId, eventId, next)}
            aria-label={`${t('queue.nextPrefix')}${next.displaySongTitle}`}
            data-testid="practice-queue-next"
          >
            {t('queue.next')}
          </Link>
        ) : (
          <span
            className={navDisabledClass}
            aria-disabled="true"
            aria-label={t('queue.nextDisabled')}
            data-testid="practice-queue-next"
          >
            {t('queue.next')}
          </span>
        )}
      </div>

      <p>
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          to={`/groups/${groupId}/events/${eventId}`}
        >
          {t('queue.backToEvent')}
        </Link>
      </p>
    </section>
  )
}
