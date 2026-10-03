import { expect, test } from '@playwright/test'
import {
  createEvent,
  createGroup,
  logout,
  openEvents,
  register,
  uniqueEmail,
} from './helpers'

test.describe('W-C group calendar', () => {
  test('TC-WS-07 group calendar lists only the current group events', async ({ page }) => {
    const email = uniqueEmail('wccal')
    await register(page, email)
    const stamp = Date.now()
    const groupA = `W-C Cal A ${stamp}`
    const groupB = `W-C Cal B ${stamp}`

    await createGroup(page, groupA)
    const idA = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(idA).toBeTruthy()

    await openEvents(page)
    await createEvent(page, { title: `W-C Evento A ${stamp}`, startsAt: '2026-10-15T19:00' })

    // A second group with its own event must never leak into group A's calendar.
    await page.goto('/grupos')
    await createGroup(page, groupB)
    await openEvents(page)
    await createEvent(page, { title: `W-C Evento B ${stamp}`, startsAt: '2026-10-16T19:00' })

    await page.goto(`/groups/${idA}/calendario`)
    await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()

    const ownEvent = page.getByTestId('calendar-event').filter({ hasText: `W-C Evento A ${stamp}` })
    await expect(ownEvent).toBeVisible()
    const foreignEvent = page.getByTestId('calendar-event').filter({ hasText: `W-C Evento B ${stamp}` })
    await expect(foreignEvent).toHaveCount(0)

    // The upcoming panel and the "view full calendar" action are present.
    await expect(page.getByRole('button', { name: 'Ver calendario completo' })).toBeVisible()
    await expect(page.getByText(`W-C Evento A ${stamp}`).first()).toBeVisible()
  })

  test('TC-WS-08 non-member cannot read the group calendar', async ({ page }) => {
    const ownerEmail = uniqueEmail('wccal-owner')
    await register(page, ownerEmail)
    const stamp = Date.now()
    await createGroup(page, `W-C Privado ${stamp}`)
    const id = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(id).toBeTruthy()

    await logout(page)
    await register(page, uniqueEmail('wccal-stranger'))
    await page.goto(`/groups/${id}/calendario`)
    await expect(page.getByRole('alert')).toContainText(
      'No encontramos este grupo o no tienes acceso.',
    )
  })
})
