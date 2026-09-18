import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createArrangement,
  createFileResource,
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

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

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

  test('TC-LIB-04 owner uploads file Resource and can download it', async ({ page }) => {
    const email = uniqueEmail('lib-file')
    const groupName = `File Band ${Date.now()}`
    const songTitle = `File Song ${Date.now()}`
    const arrangementLabel = `File Arr ${Date.now()}`
    const resourceLabel = `Notas ${Date.now()}`
    const fixturePath = path.join(fixturesDir, 'sample-chart.txt')

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel)
    await createFileResource(page, {
      label: resourceLabel,
      filePath: fixturePath,
      purpose: 'lyrics',
    })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Descargar' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('sample-chart.txt')
    const downloaded = await download.createReadStream()
    expect(downloaded).toBeTruthy()
    const chunks: Buffer[] = []
    for await (const chunk of downloaded!) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const text = Buffer.concat(chunks).toString('utf8')
    expect(text).toContain('Sonivo file Resource fixture')
  })
})
