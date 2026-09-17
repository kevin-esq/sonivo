import { expect, test } from '@playwright/test'
import {
  acceptInvite,
  addArrangementToSetlist,
  applySetlist,
  createArrangement,
  createEvent,
  createGroup,
  createSetlist,
  createSong,
  inviteMemberAndReadLink,
  logout,
  openEvents,
  openLibrary,
  openPeople,
  openSetlists,
  openSong,
  register,
  saveSetlistOrder,
  uniqueEmail,
} from './helpers'

test.describe('Invite journeys', () => {
  test('TC-INV-01 owner invites; member accepts, reads Event plan, no mutate chrome', async ({
    page,
  }) => {
    const ownerEmail = uniqueEmail('inv-owner')
    const memberEmail = uniqueEmail('inv-member')
    const stamp = Date.now()
    const groupName = `Inv Band ${stamp}`
    const songTitle = `Harbor ${stamp}`
    const arrangementLabel = `Choir key ${stamp}`
    const setlistName = `Invite set ${stamp}`
    const eventTitle = `Sunday gather ${stamp}`
    const planLine = `${songTitle} — ${arrangementLabel}`

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
    await expect(page.getByRole('heading', { name: 'Event plan' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: planLine })).toBeVisible()

    await page.getByRole('link', { name: groupName, exact: true }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await expect(page.getByRole('strong').filter({ hasText: 'Owner' })).toBeVisible()

    const inviteUrl = await inviteMemberAndReadLink(page)

    await logout(page)
    await register(page, memberEmail)
    await page.goto(inviteUrl)
    await acceptInvite(page)

    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await expect(page.getByRole('strong').filter({ hasText: 'Member' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite member' })).toHaveCount(0)

    await openEvents(page)
    await expect(page.getByText('(read-only)')).toBeVisible()
    await page.getByRole('link', { name: eventTitle }).click()
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: planLine })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply setlist' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Apply setlist' })).toHaveCount(0)

    await openSetlists(page)
    await expect(page.getByRole('button', { name: 'Nuevo setlist' })).toHaveCount(0)

    await openLibrary(page)
    await expect(page.getByRole('button', { name: 'Agregar canción' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Invite member' })).toHaveCount(0)
  })

  test('TC-INV-02 owner revokes outstanding invite; old join link fails', async ({ page }) => {
    const ownerEmail = uniqueEmail('hyg-owner')
    const memberEmail = uniqueEmail('hyg-member')
    const groupName = `Hygiene Band ${Date.now()}`

    await register(page, ownerEmail)
    await createGroup(page, groupName)
    const inviteUrl = await inviteMemberAndReadLink(page)

    await openPeople(page)
    await expect(page.getByRole('heading', { name: 'Outstanding invites' })).toBeVisible()
    await expect(page.getByText('No outstanding invites.')).toHaveCount(0)
    await page.getByRole('button', { name: /Revoke/ }).click()
    await expect(page.getByText('No outstanding invites.')).toBeVisible()

    await logout(page)
    await register(page, memberEmail)
    await page.goto(inviteUrl)
    await expect(page.getByRole('heading', { name: 'Join this group' })).toBeVisible()
    await page.getByRole('button', { name: 'Accept invite' }).click()
    await expect(page.getByRole('alert')).toContainText('This invite is invalid or expired.')
  })

  test('TC-INV-03 owner types email; invite still created; warning when mail not sent', async ({
    page,
  }) => {
    const ownerEmail = uniqueEmail('smtp-owner')
    const groupName = `Smtp Band ${Date.now()}`

    await register(page, ownerEmail)
    await createGroup(page, groupName)
    await page.getByLabel('Invitee email (optional)').fill(uniqueEmail('invitee'))
    const inviteUrl = await inviteMemberAndReadLink(page)
    expect(inviteUrl).toContain('/join/')
    await expect(page.getByRole('status')).toContainText('email was not sent')
  })
})
