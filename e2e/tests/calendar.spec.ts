import { expect, test } from '@playwright/test'
import {
  createEvent,
  createGroup,
  openEvents,
  register,
  uniqueEmail,
} from './helpers'

/** A datetime-local value a few days ahead (still inside the visible grid). */
function inDays(days: number, hour = 19): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`
}

test.describe('General calendar (ADR-0053 addendum)', () => {
  test('shows the month grid even with no events', async ({ page }) => {
    await register(page, uniqueEmail('cal-empty'))
    await page.goto('/calendario')

    await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
    await expect(page.getByTestId('calendar-day').first()).toBeVisible()
    await expect(page.getByText('Sin eventos este mes.')).toBeVisible()

    // Month navigation keeps the grid.
    await page.getByRole('button', { name: 'Mes siguiente' }).click()
    await expect(page.getByTestId('calendar-day').first()).toBeVisible()
  })

  test('shows events across groups and opens the event detail', async ({ page }) => {
    const groupName = `Cal Band ${Date.now()}`
    await register(page, uniqueEmail('cal'))
    await createGroup(page, groupName)
    await openEvents(page)
    await createEvent(page, {
      title: 'Ensayo calendario',
      type: 'rehearsal',
      startsAt: inDays(2),
    })

    await page.goto('/')
    await page.getByTestId('home-view-calendar').click()
    await expect(page).toHaveURL(/\/calendario$/)
    await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()

    const chip = page
      .getByTestId('calendar-event')
      .filter({ hasText: 'Ensayo calendario' })
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page.getByRole('heading', { name: 'Ensayo calendario' })).toBeVisible()
  })
})
