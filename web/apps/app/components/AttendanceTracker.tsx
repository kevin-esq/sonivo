'use client'

import { useState, useTransition } from 'react'
import { upsertEventRsvp } from '@/lib/api/client'
import type { EventRsvpItem, EventRsvpResponse } from '@/lib/api/types'
import { useT } from '@/lib/i18n/I18nProvider'

const OPTIONS: EventRsvpResponse[] = ['yes', 'no', 'maybe']

/**
 * Client component example: interactivity + translated copy + live group theme.
 * Colours come from the SSR-injected CSS variables (var(--color-primary)), so no
 * theme state is needed on the client. Spanish is the default dictionary.
 */
export function AttendanceTracker({
  groupId,
  eventId,
  initial,
}: {
  groupId: string
  eventId: string
  initial: EventRsvpItem[]
}) {
  const { t } = useT()
  const [items, setItems] = useState(initial)
  const [pending, startTransition] = useTransition()

  async function setResponse(response: EventRsvpResponse) {
    const updated = await upsertEventRsvp(groupId, eventId, response)
    startTransition(() => {
      setItems((previous) =>
        previous.map((item) =>
          item.userId === updated.userId
            ? { ...item, response: updated.response, updatedAt: updated.updatedAt }
            : item,
        ),
      )
    })
  }

  return (
    <section
      aria-labelledby="attendance-title"
      className="rounded-2xl border p-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <h2 id="attendance-title" className="font-semibold" style={{ color: 'var(--color-primary)' }}>
        {t('attendance.title')}
      </h2>

      <ul className="mt-3 space-y-2" aria-live="polite">
        {items.map((item) => (
          <li key={item.userId} className="flex items-center justify-between gap-3">
            <span className="truncate">{item.displayName}</span>
            <span className="text-xs uppercase tracking-wide">
              {t(`attendance.response.${item.response}`)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2" role="group" aria-label={t('attendance.chooseLabel')}>
        {OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            disabled={pending}
            onClick={() => void setResponse(option)}
            className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            {t(`attendance.action.${option}`)}
          </button>
        ))}
      </div>
    </section>
  )
}
