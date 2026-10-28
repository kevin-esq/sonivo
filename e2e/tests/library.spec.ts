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
  test('TC-LIB-07 song wizard guides the user through optional audio and review edits', async ({ page }) => {
    const email = uniqueEmail('lib-wizard-review')
    const groupName = `Wizard Review Band ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await page.getByRole('button', { name: 'Agregar canción' }).first().click()

    const dialog = page.getByTestId('create-song-dialog')
    await dialog.getByLabel('Título').fill('Borrador de revisión')
    await dialog.getByRole('button', { name: 'Continuar' }).click()
    await expect(dialog.getByRole('heading', { name: 'Audio de la primera versión' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Omitir audio' }).click()
    await expect(dialog.getByRole('heading', { name: 'Crear una versión' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Continuar' }).click()

    await expect(dialog.getByRole('heading', { name: 'Información básica' })).toBeVisible()
    await expect(dialog.getByText('Sin audio. Puedes añadirlo más adelante.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Editar' }).nth(2).click()
    await expect(dialog.getByText('Borrador de revisión')).toBeVisible()

    await dialog.getByRole('button', { name: 'Cerrar' }).click()
    await expect(dialog.getByText('Tienes cambios sin guardar.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Descartar cambios' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('TC-LIB-08 song wizard creates multiple versions in one pass', async ({ page }) => {
    const email = uniqueEmail('lib-multiple-versions')
    const groupName = `Multi Version Band ${Date.now()}`
    const songTitle = `Multi Version Song ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await page.getByRole('button', { name: 'Agregar canción' }).first().click()

    const dialog = page.getByTestId('create-song-dialog')
    await dialog.getByLabel('Título').fill(songTitle)
    await dialog.getByRole('button', { name: 'Continuar' }).click()
    await dialog.getByRole('button', { name: 'Omitir audio' }).click()
    await dialog.getByRole('button', { name: 'Agregar otra versión' }).click()
    await dialog.getByPlaceholder('p. ej. Barítono').fill('Barítono')
    await expect(dialog.getByText('Canción seleccionada:')).toBeVisible()
    await expect(dialog.getByTestId('song-version-audio-1')).toBeVisible()
    await expect(dialog.getByTestId('song-version-audio-2')).toBeVisible()
    const moreOptions = dialog.getByRole('button', { name: /datos del ensayo/ })
    await moreOptions.nth(0).click()
    await expect(moreOptions.nth(0)).toHaveAttribute('aria-expanded', 'true')
    await expect(moreOptions.nth(1)).toHaveAttribute('aria-expanded', 'false')
    await dialog.getByRole('button', { name: 'Continuar' }).click()
    await expect(dialog.getByText('Versión 1')).toBeVisible()
    await expect(dialog.getByText('Versión 2')).toBeVisible()
    await dialog.getByRole('button', { name: 'Crear canción' }).click()
    await expect(dialog.getByRole('heading', { name: '¡Listo!' })).toBeVisible()
    await dialog.getByRole('link', { name: 'Abrir canción' }).click()

    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()
    await page.getByRole('button', { name: 'Cambiar versión' }).click()
    const versionPicker = page.getByTestId('song-arrangement-picker')
    await expect(versionPicker.getByRole('button', { name: /Barítono/ })).toBeVisible()
    await versionPicker.getByRole('button', { name: /Barítono/ }).click()
    await expect(page.getByText('Barítono', { exact: true })).toBeVisible()
  })

  test('TC-LIB-05 dirty song wizard asks before discarding its draft', async ({ page }) => {
    const email = uniqueEmail('lib-draft')
    const groupName = `Draft Band ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await page.getByRole('button', { name: 'Agregar canción' }).first().click()

    const dialog = page.getByTestId('create-song-dialog')
    const title = dialog.getByLabel('Título')
    await title.fill('Borrador sin guardar')
    await page.keyboard.press('Escape')

    await expect(dialog.getByText('Tienes cambios sin guardar.')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog.getByText('Tienes cambios sin guardar.')).toHaveCount(0)
    await expect(title).toHaveValue('Borrador sin guardar')

    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog.getByText('Tienes cambios sin guardar.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(title).toHaveValue('Borrador sin guardar')

    await dialog.getByRole('button', { name: 'Cerrar' }).click()
    await dialog.getByRole('button', { name: 'Descartar cambios' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('TC-LIB-06 search state stays in the URL and returns after opening a Song', async ({ page }) => {
    const email = uniqueEmail('lib-return')
    const groupName = `Return Band ${Date.now()}`
    const songTitle = `Return Song ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await page.getByTestId('group-rail').getByRole('link', { name: 'Canciones', exact: true }).click()
    await page.getByTestId('library-search').fill(songTitle)
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(songTitle)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByTestId('library-list')).toBeVisible()
    await page.getByRole('button', { name: 'Más opciones para Canciones' }).click()
    await expect(page.getByRole('combobox', { name: 'Por tema' })).toBeVisible()
    await page.getByRole('button', { name: 'Más opciones para Canciones' }).click()
    await page.setViewportSize({ width: 918, height: 684 })
    await expect(page.getByTestId('library-list')).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(songTitle) })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('link', { name: new RegExp(songTitle) }).click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()
    const versionsHeading = page.getByRole('heading', { name: 'Versiones' })
    expect(await versionsHeading.evaluate((heading) => Boolean(
      document.querySelector('[role="tablist"]') &&
      (heading.compareDocumentPosition(document.querySelector('[role="tablist"]')!) & Node.DOCUMENT_POSITION_FOLLOWING),
    ))).toBe(true)
    await page.goBack()
    await expect(page.getByTestId('library-search')).toHaveValue(songTitle)
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(songTitle)
  })

  test('TC-LIB-09 song edit from the row menu opens a dialog and keeps the library route', async ({ page }) => {
    const email = uniqueEmail('lib-edit-dialog')
    const groupName = `Edit Dialog Band ${Date.now()}`
    const songTitle = `Edit Dialog Song ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)

    const routeBeforeEdit = page.url()
    await page.getByRole('button', { name: `Más opciones para ${songTitle}` }).click()
    await page.getByRole('menuitem', { name: 'Editar canción' }).click()

    const dialog = page.getByRole('dialog', { name: 'Editar canción' })
    await expect(dialog).toBeVisible()
    const title = dialog.getByLabel('Título')
    await expect(title).toHaveValue(songTitle)
    expect(page.url()).toBe(routeBeforeEdit)

    await title.fill(`${songTitle} editada`)
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog.getByText('Tienes cambios sin guardar.')).toBeVisible()
    await dialog.getByRole('group').getByRole('button', { name: 'Cancelar' }).click()
    await expect(title).toHaveValue(`${songTitle} editada`)
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await dialog.getByRole('button', { name: 'Descartar cambios' }).click()
    await expect(dialog).toHaveCount(0)
    expect(page.url()).toBe(routeBeforeEdit)
  })

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

    await page.getByRole('link', { name: songTitle }).first().click()
    await expect(page.getByRole('link', { name: 'Practicar', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Practicar', exact: true }).click()
    await expect(page.getByRole('tablist', { name: 'Secciones de práctica' })).toBeVisible()
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
    await expect(page.getByText('Aún no hay canciones')).toBeVisible()
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

    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
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
