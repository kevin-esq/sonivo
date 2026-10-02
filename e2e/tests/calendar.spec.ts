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
  test('shows the month grid even with no events and navigates months', async ({ page }) => {
    await register(page, uniqueEmail('cal-empty'))
    await page.goto('/calendario')

    await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
    await expect(page.getByTestId('calendar-day').first()).toBeVisible()
    await expect(page.getByText('Sin eventos.').last()).toBeVisible()

    await page.getByRole('button', { name: 'Siguiente' }).first().click()
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
      .first()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page.getByRole('heading', { name: 'Ensayo calendario' })).toBeVisible()
  })

  test('switches between month, week and day views', async ({ page }) => {
    await register(page, uniqueEmail('cal-views'))
    await page.goto('/calendario')

    await page.getByRole('button', { name: 'Semana' }).click()
    await expect(page.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Día' }).click()
    await expect(page.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Sin eventos.').first()).toBeVisible()
  })

  test('creates an event from the calendar', async ({ page }) => {
    const groupName = `Cal Create ${Date.now()}`
    await register(page, uniqueEmail('cal-create'))
    await createGroup(page, groupName)
    await page.goto('/calendario')

    await page.getByRole('button', { name: 'Nuevo evento' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nuevo evento' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Título').fill('Evento desde calendario')
    await dialog.getByRole('button', { name: 'Crear evento' }).click()
    await expect(dialog).toHaveCount(0)

    await expect(
      page.getByTestId('calendar-event').filter({ hasText: 'Evento desde calendario' }).first(),
    ).toBeVisible()
  })

  test('mobile filters panel changes the view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await register(page, uniqueEmail('cal-filters'))
    await page.goto('/calendario')

    await page.getByTestId('calendar-filters-button').click()
    const panel = page.getByRole('dialog', { name: 'Filtros y vista' })
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: 'Semana' }).click()
    await panel.getByRole('button', { name: 'Aplicar' }).click()
    await expect(panel).toHaveCount(0)
  })
})
