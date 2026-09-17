import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createGroup,
  createLinkResource,
  createSong,
  deleteSong,
  logout,
  openLibrary,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

test.describe('Library journeys', () => {
  test('TC-LIB-01 owner creates Song, Arrangement, and link Resource', async ({ page }) => {
    const email = uniqueEmail('lib-owner')
    const groupName = `Lib Band ${Date.now()}`
    const songTitle = `Song ${Date.now()}`
    const arrangementLabel = `Arr ${Date.now()}`
    const resourceLabel = `Chart ${Date.now()}`
    const resourceUrl = `https://example.com/charts/${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)

    await createSong(page, songTitle)
    await openSong(page, songTitle)

    await createArrangement(page, arrangementLabel)
    await createLinkResource(page, {
      label: resourceLabel,
      url: resourceUrl,
      purpose: 'chart',
    })
  })

  test('TC-LIB-02 owner soft-deletes a Song from the library', async ({ page }) => {
    const email = uniqueEmail('lib-del')
    const groupName = `Delete Band ${Date.now()}`
    const songTitle = `Doomed Song ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)

    await deleteSong(page, songTitle)
    await expect(page.getByText('La biblioteca está vacía')).toBeVisible()
  })

  test('TC-LIB-03 non-member cannot open library by URL', async ({ page }) => {
    const ownerEmail = uniqueEmail('lib-owner3')
    const strangerEmail = uniqueEmail('lib-stranger')
    const groupName = `Private Lib ${Date.now()}`

    await register(page, ownerEmail)
    await createGroup(page, groupName)
    const groupUrl = page.url()
    expect(groupUrl).toMatch(/\/groups\/[0-9a-f-]+/i)
    const groupId = groupUrl.match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(groupId).toBeTruthy()

    await logout(page)
    await register(page, strangerEmail)
    await page.goto(`/groups/${groupId}/library`)

    await expect(page.getByRole('alert')).toContainText(
      'No encontramos este grupo o no tienes acceso.',
    )
  })
})
