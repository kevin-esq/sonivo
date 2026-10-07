import { expect, test } from '@playwright/test'
import {
  acceptInvite,
  createGroup,
  createSong,
  inviteMemberAndReadLink,
  openLibrary,
  register,
  uniqueEmail,
} from './helpers'

/**
 * Cross-user real time (ADR-0074): a change made by one member must appear for
 * another member without a reload, over the group SignalR hub.
 */
test.describe('Real time across users', () => {
  test('a song created by the owner appears live for a member', async ({ browser }) => {
    const ownerContext = await browser.newContext()
    const owner = await ownerContext.newPage()
    await register(owner, uniqueEmail('rt-owner'))
    const groupName = `RT Band ${Date.now()}`
    await createGroup(owner, groupName)
    const joinPath = await inviteMemberAndReadLink(owner)

    const memberContext = await browser.newContext()
    const member = await memberContext.newPage()
    await register(member, uniqueEmail('rt-member'))
    await member.goto(joinPath)
    await acceptInvite(member)

    // Both open the library; the member keeps it open (no reload).
    await openLibrary(owner)
    await openLibrary(member)

    const songTitle = `RT Song ${Date.now()}`
    await createSong(owner, songTitle)

    // The member sees it live, without navigating or reloading.
    await expect(member.getByRole('link', { name: songTitle })).toBeVisible({ timeout: 15_000 })

    await ownerContext.close()
    await memberContext.close()
  })
})
