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

test.describe('W2 Listas immersive redesign', () => {
  test('search filters the song list with an aria-live count', async ({ page }) => {
    const email = uniqueEmail('w2-search')
    const groupName = `W2 Search Band ${Date.now()}`
    const stamp = Date.now()
    const alphaTitle = `W2 Alpha ${stamp}`
    const betaTitle = `W2 Beta ${stamp}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await expect(page.getByTestId('library-hero')).toBeVisible()

    await createSong(page, alphaTitle)
    await createSong(page, betaTitle)

    const search = page.getByTestId('library-search')
    await expect(search).toBeVisible()
    await expect(search).toHaveAttribute('aria-label', 'Buscar canciones')

    await search.fill('Alpha')
    await expect(page.getByRole('link', { name: alphaTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: betaTitle })).toHaveCount(0)
    await expect(page.getByTestId('library-results')).toContainText('1')

    await search.fill('sin-coincidencias-xyz')
    await expect(page.getByText('Sin resultados para esta búsqueda')).toBeVisible()
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click()
    await expect(page.getByRole('link', { name: alphaTitle })).toBeVisible()
    await expect(page.getByRole('link', { name: betaTitle })).toBeVisible()
  })

  test('readiness chips and disclosure Song → Arrangement → Resources', async ({ page }) => {
    const email = uniqueEmail('w2-chips')
    const groupName = `W2 Chips Band ${Date.now()}`
    const stamp = Date.now()
    const songTitle = `W2 Chip Song ${stamp}`
    const arrangementLabel = `W2 Chip Arr ${stamp}`
    const resourceLabel = `W2 Chart ${stamp}`
    const resourceUrl = `https://example.com/charts/${stamp}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)

    await expect(page.getByTestId('song-hero')).toBeVisible()
    await expect(page.getByTestId('song-readiness')).toContainText('Sin arreglo')

    await createArrangement(page, arrangementLabel, { defaultKey: 'G', defaultBpm: '100' })

    await expect(page.getByTestId('arrangement-hero')).toBeVisible()
    await expect(page.getByTestId('arrangement-resource-count')).toContainText('Sin recursos')
    await expect(page.getByTestId('arrangement-chart-chip')).toContainText('Sin partitura')

    await createLinkResource(page, {
      label: resourceLabel,
      url: resourceUrl,
      purpose: 'chart',
    })
    await expect(page.getByTestId('arrangement-resource-count')).toContainText('1 recurso')
    await expect(page.getByTestId('arrangement-chart-chip')).toContainText('Con partitura')

    await page.getByRole('link', { name: songTitle }).first().click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()
    await expect(page.getByTestId('song-readiness')).toContainText('1 arreglo')

    const row = page.getByRole('link', { name: arrangementLabel })
    await expect(row.getByTestId('arrangement-readiness')).toContainText('G')
    await row.click()
    await expect(page.getByRole('heading', { name: arrangementLabel })).toBeVisible()
  })

  test('empty library keeps the next-step CTA', async ({ page }) => {
    const email = uniqueEmail('w2-empty')
    const groupName = `W2 Empty Band ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)

    await expect(page.getByText('Aún no hay canciones')).toBeVisible()
    await expect(page.getByTestId('library-search')).toHaveCount(0)
    const cta = page.getByTestId('library-empty-add-song')
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page.getByRole('heading', { name: 'Crear canción' })).toBeVisible()
  })
})
