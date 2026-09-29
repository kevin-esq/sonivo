import { expect, test } from '@playwright/test'
import {
  addArrangementToSetlist,
  applySetlist,
  createArrangement,
  createEvent,
  createGroup,
  createSetlist,
  createSong,
  eventPlanItem,
  openEvents,
  openLibrary,
  openSetlists,
  openSong,
  register,
  saveSetlistOrder,
  uniqueEmail,
} from './helpers'

async function seedLibraryAndOpenGroup(
  page: Parameters<typeof register>[0],
  input: { groupName: string; songTitle: string; arrangementLabel: string },
) {
  await createGroup(page, input.groupName)
  await openLibrary(page)
  await createSong(page, input.songTitle)
  await openSong(page, input.songTitle)
  await createArrangement(page, input.arrangementLabel)
  await page.getByRole('link', { name: input.groupName, exact: true }).click()
  await expect(page.getByRole('heading', { name: input.groupName })).toBeVisible()
}

test.describe('W4 Scheduling operate tables', () => {
  test('hero strips visible on all four scheduling pages', async ({ page }) => {
    const email = uniqueEmail('w4-hero')
    const stamp = Date.now()
    const groupName = `W4 Hero Band ${stamp}`
    const songTitle = `W4 Tune ${stamp}`
    const arrangementLabel = `W4 Key ${stamp}`
    const setlistName = `W4 Set ${stamp}`
    const eventTitle = `W4 Night ${stamp}`
    const planLine = `${songTitle} — ${arrangementLabel}`

    await register(page, email)
    await seedLibraryAndOpenGroup(page, { groupName, songTitle, arrangementLabel })

    await openSetlists(page)
    await expect(page.getByTestId('setlists-hero')).toBeVisible()

    await createSetlist(page, setlistName)
    await expect(page.getByTestId('setlist-hero')).toBeVisible()
    await addArrangementToSetlist(page, planLine)
    await saveSetlistOrder(page)

    await openEvents(page)
    await expect(page.getByTestId('events-hero')).toBeVisible()

    await createEvent(page, { title: eventTitle, startsAt: '2026-10-01T19:00' })
    await expect(page.getByTestId('event-hero')).toBeVisible()
  })

  test('setlist empty-state CTA creates a list', async ({ page }) => {
    const email = uniqueEmail('w4-empty')
    const stamp = Date.now()
    const groupName = `W4 Empty Band ${stamp}`
    const setlistName = `W4 First ${stamp}`

    await register(page, email)
    await createGroup(page, groupName)
    await openSetlists(page)

    await expect(page.getByTestId('setlists-hero')).toBeVisible()
    await expect(page.getByText('Aún no hay listas')).toBeVisible()
    const cta = page.getByTestId('setlists-empty-create')
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page.getByRole('heading', { name: 'Crear lista' })).toBeVisible()
    await page.getByLabel('Nombre').fill(setlistName)
    await page.getByRole('button', { name: 'Crear lista' }).click()
    await expect(page.getByRole('heading', { name: setlistName })).toBeVisible()
    await expect(page.getByTestId('setlist-status-chip')).toContainText('Vacía')
  })

  test('event status chip shows plan aplicado tras apply', async ({ page }) => {
    const email = uniqueEmail('w4-chip')
    const stamp = Date.now()
    const groupName = `W4 Chip Band ${stamp}`
    const songTitle = `W4 Harbor ${stamp}`
    const arrangementLabel = `W4 Choir ${stamp}`
    const setlistName = `W4 Chip set ${stamp}`
    const eventTitle = `W4 Chip night ${stamp}`
    const planLine = `${songTitle} — ${arrangementLabel}`

    await register(page, email)
    await seedLibraryAndOpenGroup(page, { groupName, songTitle, arrangementLabel })

    await openSetlists(page)
    await createSetlist(page, setlistName)
    await addArrangementToSetlist(page, planLine)
    await saveSetlistOrder(page)

    await openEvents(page)
    await createEvent(page, { title: eventTitle, startsAt: '2026-12-06T10:00' })
    await expect(page.getByTestId('event-status-chip')).toContainText('Borrador')

    await applySetlist(page)
    await expect(page.getByTestId('event-status-chip')).toContainText('Plan aplicado')
    await expect(eventPlanItem(page, songTitle, arrangementLabel)).toBeVisible()
  })
})
