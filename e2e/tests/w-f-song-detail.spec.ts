import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createGroup,
  createLinkResource,
  createSong,
  openLibrary,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

test.describe('W-F song detail', () => {
  test('TC-WS-13 tabs, Información sidebar and related files', async ({ page }) => {
    const email = uniqueEmail('wfsong')
    await register(page, email)
    const stamp = Date.now()
    await createGroup(page, `W-F Song ${stamp}`)
    await openLibrary(page)
    const songTitle = `W-F Cancion ${stamp}`
    await createSong(page, songTitle)
    await openSong(page, songTitle)

    const arrangementLabel = `W-F Arr ${stamp}`
    await createArrangement(page, arrangementLabel, {
      defaultKey: 'G',
      defaultBpm: '68',
      lyrics: 'Santo es el Señor',
      chords: 'G C D',
    })
    await createLinkResource(page, {
      label: `W-F Guia ${stamp}`,
      url: `https://example.com/guia-${stamp}`,
      purpose: 'reference',
    })

    // Back to the song detail via the breadcrumb.
    await page.getByRole('link', { name: songTitle }).first().click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()

    // Tabs: Letra / Acordes / Notas / Archivos.
    for (const tab of ['lyrics', 'chords', 'notes', 'files']) {
      await expect(page.getByTestId(`song-tab-${tab}`)).toBeVisible()
    }
    await page.getByTestId('song-tab-chords').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText('G C D')
    await page.getByTestId('song-tab-lyrics').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText('Santo es el Señor')
    await page.getByTestId('song-tab-notes').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText('Aún no hay notas en este arreglo.')
    await page.getByTestId('song-tab-files').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText(`W-F Guia ${stamp}`)

    // Información sidebar.
    const facts = page.getByTestId('song-facts')
    await expect(facts).toContainText('Información')
    await expect(facts).toContainText('G')
    await expect(facts).toContainText('68 BPM')

    // Related files in the sidebar.
    await expect(facts).toContainText('Archivos relacionados')
    await expect(facts.getByRole('link', { name: `W-F Guia ${stamp}` })).toBeVisible()
  })
})
