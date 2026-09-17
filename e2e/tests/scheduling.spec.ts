import { expect, test } from '@playwright/test'
import {
  addArrangementToSetlist,
  applySetlist,
  createArrangement,
  createEvent,
  createGroup,
  createSetlist,
  createSong,
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

test.describe('Scheduling journeys', () => {
  test('TC-EVT-01 owner composes Setlist, creates Event, applies plan', async ({ page }) => {
    const email = uniqueEmail('evt-owner')
    const stamp = Date.now()
    const groupName = `Evt Band ${stamp}`
    const songTitle = `Ocean ${stamp}`
    const arrangementLabel = `Band key ${stamp}`
    const setlistName = `Sunday set ${stamp}`
    const eventTitle = `Friday night ${stamp}`
    const planLine = `${songTitle} — ${arrangementLabel}`

    await register(page, email)
    await seedLibraryAndOpenGroup(page, { groupName, songTitle, arrangementLabel })

    await openSetlists(page)
    await createSetlist(page, setlistName)
    await addArrangementToSetlist(page, planLine)
    await saveSetlistOrder(page)

    await openEvents(page)
    await createEvent(page, { title: eventTitle, startsAt: '2026-10-01T19:00' })
    await expect(page.getByText('No plan yet')).toBeVisible()

    await applySetlist(page)
    await expect(page.getByRole('heading', { name: 'Event plan' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: planLine })).toBeVisible()
    await expect(page.getByText('No plan yet')).toHaveCount(0)
  })

  test('TC-EVT-02 setlist edit does not change Event plan until re-apply', async ({ page }) => {
    const email = uniqueEmail('evt-hist')
    const stamp = Date.now()
    const groupName = `Hist Band ${stamp}`
    const songTitle = `River ${stamp}`
    const arrangementLabel = `Acoustic ${stamp}`
    const setlistName = `Template ${stamp}`
    const eventTitle = `Saturday ${stamp}`
    const planLine = `${songTitle} — ${arrangementLabel}`

    await register(page, email)
    await seedLibraryAndOpenGroup(page, { groupName, songTitle, arrangementLabel })

    await openSetlists(page)
    await createSetlist(page, setlistName)
    await addArrangementToSetlist(page, planLine)
    await saveSetlistOrder(page)

    await openEvents(page)
    await createEvent(page, { title: eventTitle, startsAt: '2026-11-07T18:00' })
    await applySetlist(page)
    await expect(page.getByRole('listitem').filter({ hasText: planLine })).toHaveCount(1)

    await openSetlists(page)
    await page.getByRole('link', { name: setlistName }).click()
    await expect(page.getByRole('heading', { name: setlistName })).toBeVisible()
    await addArrangementToSetlist(page, planLine)
    await saveSetlistOrder(page)
    await expect(page.getByRole('listitem').filter({ hasText: planLine })).toHaveCount(2)

    await openEvents(page)
    await page.getByRole('link', { name: eventTitle }).click()
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: planLine })).toHaveCount(1)
  })
})
