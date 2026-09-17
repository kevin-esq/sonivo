import { expect, test } from '@playwright/test'
import { createEvent, createGroup, openEvents, register, uniqueEmail } from './helpers'

test.describe('Event lifecycle journeys', () => {
  test('TC-EVT-03 owner patches Event title then cancel hides it from the list', async ({
    page,
  }) => {
    const email = uniqueEmail('evt-life')
    const stamp = Date.now()
    const groupName = `Life Band ${stamp}`
    const originalTitle = `Original gather ${stamp}`
    const updatedTitle = `Renamed gather ${stamp}`

    await register(page, email)
    await createGroup(page, groupName)
    await openEvents(page)
    await createEvent(page, { title: originalTitle, startsAt: '2026-12-13T19:00' })

    await page.getByRole('button', { name: 'Edit event' }).click()
    await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible()
    await page.getByLabel('Title').fill(updatedTitle)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible()

    await openEvents(page)
    await expect(page.getByRole('link', { name: updatedTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: originalTitle })).toHaveCount(0)

    await page.getByRole('link', { name: updatedTitle }).click()
    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel event' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel event' }).click()

    await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible()
    await expect(page.getByRole('link', { name: updatedTitle })).toHaveCount(0)
    await expect(page.getByRole('link', { name: originalTitle })).toHaveCount(0)
    await expect(page.getByText(/No events yet/)).toBeVisible()
  })
})
