import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createGroup,
  createSong,
  logout,
  openLibrary,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

test.describe('W-D resources', () => {
  test('TC-WS-09 owner uploads a resource and it shows in the library', async ({ page }) => {
    const email = uniqueEmail('wdres')
    await register(page, email)
    const stamp = Date.now()
    await createGroup(page, `W-D Res ${stamp}`)
    await openLibrary(page)
    const songTitle = `W-D Song ${stamp}`
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, `W-D Arr ${stamp}`)

    await page.getByTestId('group-rail').getByRole('link', { name: 'Recursos' }).click()
    await expect(page.getByRole('heading', { name: 'Recursos' })).toBeVisible()

    await page.getByRole('button', { name: 'Subir recurso' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Subir recurso' })).toBeVisible()
    await dialog.getByLabel('Título').fill(`W-D Guia ${stamp}`)
    await dialog.locator('input[type="file"]').setInputFiles(path.join(fixturesDir, 'practice-a.wav'))
    await dialog.getByRole('button', { name: 'Subir recurso' }).click()

    await expect(page.getByText(`W-D Guia ${stamp}`)).toBeVisible()
  })

  test('TC-WS-10 non-member cannot read the resources library', async ({ page }) => {
    const ownerEmail = uniqueEmail('wdres-owner')
    await register(page, ownerEmail)
    const stamp = Date.now()
    await createGroup(page, `W-D Privado ${stamp}`)
    const id = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(id).toBeTruthy()

    await logout(page)
    await register(page, uniqueEmail('wdres-stranger'))
    await page.goto(`/groups/${id}/recursos`)
    await expect(page.getByRole('alert')).toContainText(
      'No encontramos este grupo o no tienes acceso.',
    )
  })
})
