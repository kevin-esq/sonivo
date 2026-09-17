import { expect, test } from '@playwright/test'
import {
  acceptInvite,
  addArrangementToSetlist,
  applySetlist,
  attendanceRegion,
  createArrangement,
  createEvent,
  createGroup,
  createSetlist,
  createSong,
  eventPlanItem,
  inviteMemberAndReadLink,
  login,
  logout,
  openEvents,
  openLibrary,
  openSetlists,
  openSong,
  register,
  saveSetlistOrder,
  setRsvpYes,
  uniqueEmail,
} from './helpers'

test.describe('RSVP journeys', () => {
  test('TC-RSVP-01 member sets Yes; owner sees that name and Yes', async ({ page }) => {
    const ownerEmail = uniqueEmail('rsvp-owner')
    const memberEmail = uniqueEmail('rsvp-member')
    const memberDisplayName = memberEmail.split('@')[0] ?? 'e2e'
    const stamp = Date.now()
    const groupName = `Rsvp Band ${stamp}`
    const songTitle = `Harbor ${stamp}`
    const arrangementLabel = `Choir key ${stamp}`
    const setlistName = `Rsvp set ${stamp}`
    const eventTitle = `Sunday gather ${stamp}`
    const planLine = `${songTitle} — ${arrangementLabel}`
    const memberYesRow = () =>
      page
        .getByRole('listitem')
        .filter({ hasText: memberDisplayName })
        .filter({ hasText: 'Sí' })

    await register(page, ownerEmail)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel)
    await page.getByRole('link', { name: groupName, exact: true }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await openSetlists(page)
    await createSetlist(page, setlistName)
    await addArrangementToSetlist(page, planLine)
    await saveSetlistOrder(page)

    await openEvents(page)
    await createEvent(page, { title: eventTitle, startsAt: '2026-12-06T10:00' })
    await applySetlist(page)
    await expect(page.getByRole('heading', { name: 'Plan del evento' })).toBeVisible()
    await expect(eventPlanItem(page, songTitle, arrangementLabel)).toBeVisible()

    await page.getByRole('link', { name: groupName, exact: true }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    const inviteUrl = await inviteMemberAndReadLink(page)

    await logout(page)
    await register(page, memberEmail)
    await page.goto(inviteUrl)
    await acceptInvite(page)

    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await expect(page.getByRole('strong').filter({ hasText: 'Member' })).toBeVisible()

    await openEvents(page)
    await page.getByRole('link', { name: eventTitle }).click()
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible()
    await expect(eventPlanItem(page, songTitle, arrangementLabel)).toBeVisible()

    await setRsvpYes(page)
    await expect(memberYesRow()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aplicar setlist' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Aplicar setlist' })).toHaveCount(0)

    await logout(page)
    await login(page, ownerEmail)
    await page.getByRole('link', { name: groupName, exact: true }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await openEvents(page)
    await page.getByRole('link', { name: eventTitle }).click()
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible()
    await expect(attendanceRegion(page)).toBeVisible()
    await expect(memberYesRow()).toBeVisible()
  })
})
