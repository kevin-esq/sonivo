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
  setlistItem,
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
  test('TC-SETLIST-ORDER-01 rows slide and renumber while dragging', async ({ page }) => {
    const stamp = Date.now()
    const groupName = `Order Band ${stamp}`
    const setlistName = `Order set ${stamp}`
    const songs = [1, 2, 3].map((index) => ({
      title: `Order song ${index} ${stamp}`,
      arrangement: `Order version ${index} ${stamp}`,
    }))

    await register(page, uniqueEmail('setlist-order'))
    await createGroup(page, groupName)
    for (const song of songs) {
      await openLibrary(page)
      await createSong(page, song.title)
      await openSong(page, song.title)
      await createArrangement(page, song.arrangement)
      await page.getByRole('link', { name: groupName, exact: true }).click()
    }

    await openSetlists(page)
    await createSetlist(page, setlistName)
    for (const song of songs) {
      await addArrangementToSetlist(page, `${song.title} — ${song.arrangement}`)
    }
    await saveSetlistOrder(page)

    const rows = page.locator('[data-setlist-item]')
    const first = await rows.nth(0).boundingBox()
    const third = await rows.nth(2).boundingBox()
    expect(first).not.toBeNull()
    expect(third).not.toBeNull()
    const handle = page.getByRole('button', { name: 'Arrastrar ítem 3' })
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2, { steps: 12 })

    await expect.poll(async () => rows.nth(0).locator(':scope > span').first().textContent()).toBe('02')
    await expect.poll(async () => rows.nth(1).locator(':scope > span').first().textContent()).toBe('03')
    await expect.poll(async () => rows.nth(0).evaluate((row) => getComputedStyle(row).transform)).not.toBe('none')
    await expect.poll(async () => rows.nth(1).evaluate((row) => getComputedStyle(row).transform)).not.toBe('none')
    await page.mouse.up()

    await expect(rows.nth(0)).toContainText(songs[2]!.title)
    await expect(rows.nth(1)).toContainText(songs[0]!.title)
    await expect(rows.nth(2)).toContainText(songs[1]!.title)
  })

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
    await expect(page.getByText('Aún no hay plan')).toBeVisible()

    await applySetlist(page)
    await expect(page.getByRole('heading', { name: 'Plan del evento' })).toBeVisible()
    await expect(eventPlanItem(page, songTitle, arrangementLabel)).toBeVisible()
    await expect(page.getByText('Aún no hay plan')).toHaveCount(0)
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
    await expect(eventPlanItem(page, songTitle, arrangementLabel)).toHaveCount(1)

    await openSetlists(page)
    await page.getByRole('link', { name: setlistName }).click()
    await expect(page.getByRole('heading', { name: setlistName })).toBeVisible()
    await addArrangementToSetlist(page, planLine)
    await saveSetlistOrder(page)
    await expect(setlistItem(page, songTitle, arrangementLabel)).toHaveCount(2)

    await openEvents(page)
    await page.getByRole('link', { name: eventTitle }).click()
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible()
    await expect(eventPlanItem(page, songTitle, arrangementLabel)).toHaveCount(1)
  })
})
