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
  test('TC-WS-13 versions, song materials and related files', async ({ page }) => {
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
    // A single version is shown directly; the chooser appears only when there
    // is a real choice to make.
    await expect(page.getByText(/Tono: G.*Tempo: 68/)).toBeVisible()

    const secondArrangementLabel = `W-F Acoustic ${stamp}`
    await createArrangement(page, secondArrangementLabel, { lyrics: 'Otra forma de preparar esta canción' })
    await page.getByRole('link', { name: songTitle }).first().click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()

    await page.getByRole('button', { name: /(?:Cambiar|Elegir) versión/ }).click()
    const versionChoice = page.getByRole('button', { name: `Consultar materiales de ${arrangementLabel}` })
    const secondVersionChoice = page.getByRole('button', { name: `Consultar materiales de ${secondArrangementLabel}` })
    await expect(versionChoice).toHaveAttribute('aria-pressed', 'false')
    await versionChoice.click()
    await expect(page.getByTestId('song-arrangement-picker')).toBeHidden()
    await expect(page.getByRole('heading', { name: arrangementLabel })).toBeVisible()

    // Tabs: Letra / Acordes / Notas / Archivos.
    for (const tab of ['lyrics', 'chords', 'notes', 'files']) {
      await expect(page.getByTestId(`song-tab-${tab}`)).toBeVisible()
    }
    await page.getByTestId('song-tab-chords').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText('G C D')
    await page.getByTestId('song-tab-lyrics').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText('Santo es el Señor')
    await page.getByTestId('song-tab-notes').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText('Esta versión todavía no tiene notas.')
    await page.getByTestId('song-tab-files').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText(`W-F Guia ${stamp}`)

    await page.getByRole('button', { name: /(?:Cambiar|Elegir) versión/ }).click()
    await expect(versionChoice).toHaveAttribute('aria-pressed', 'true')
    await secondVersionChoice.click()
    await expect(page.getByTestId('song-arrangement-picker')).toBeHidden()
    await expect(page.getByRole('heading', { name: secondArrangementLabel })).toBeVisible()
    await page.getByTestId('song-tab-lyrics').click()
    await expect(page.getByTestId('song-tabpanel')).toContainText('Otra forma de preparar esta canción')
    await expect(page.getByRole('link', { name: 'Editar materiales' })).toBeVisible()
  })
})
