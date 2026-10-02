import { expect, test } from '@playwright/test'
import { createGroup, openEvents, register, uniqueEmail } from './helpers'

/**
 * Phase 4.8 (F5): when notifications are enabled the group events page offers the
 * per-group ICS feed (ADR-0052).
 */
test('group calendar feed is offered when notifications are on', async ({ page, request }) => {
  const features = (await (await request.get('/api/features')).json()) as { notifications?: boolean }
  test.skip(!features.notifications, 'Features:Notifications is off')

  await register(page, uniqueEmail('calendar-owner'))
  await createGroup(page, 'Calendario')
  await openEvents(page)

  const feed = page.getByTestId('events-calendar-feed')
  await expect(feed).toBeVisible()
  await expect(feed).toHaveAttribute('href', /\/api\/groups\/[0-9a-f-]+\/calendar\.ics$/)
})
