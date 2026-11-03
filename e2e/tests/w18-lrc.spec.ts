import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createGroup,
  createSong,
  openLibrary,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

/**
 * Phase 4.2 (.lrc). Requires the API to run with Features__Lrc=true
 * (`.scratch/HANDOFF.md` records the exact runner command).
 */
test.describe('W18 .lrc import, preview, offset, apply and export', () => {
  test('owner imports, previews, offsets, applies and exports', async ({ page, request }) => {
    // Default configuration has Features:Lrc off; skip instead of failing the suite.
    const flags = await (await request.get('/api/features')).json()
    test.skip(!flags.lrc, 'Features:Lrc is off')

    const email = uniqueEmail('w18lrc')
    await register(page, email)
    await createGroup(page, `W18 ${Date.now()}`)

    await openLibrary(page)
    await createSong(page, 'LRC Song')
    await openSong(page, 'LRC Song')
    await createArrangement(page, 'Acoustic')
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Editar letra/ }).click()
    await expect(page.getByTestId('arrangement-editor')).toBeVisible()

    // Import is an advanced option inside the lyrics editor.
    await page.getByTestId('open-lyrics-dialog').click()
    const addLyricsDialog = page.getByTestId('lyric-import-options')
    await page.route('**/lyrics/lookup', async (route) => route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: '{}',
    }))
    await addLyricsDialog.getByRole('button', { name: 'Buscar', exact: true }).click()
    const missingResponse = page.waitForResponse(response => response.url().includes('/lyrics/lookup'))
    await addLyricsDialog.getByRole('button', { name: 'Buscar letra' }).click()
    expect((await missingResponse).status()).toBe(404)
    await expect(addLyricsDialog.getByRole('status')).toContainText('Letra sincronizada no encontrada')
    await expect(addLyricsDialog.getByRole('alert')).toHaveCount(0)
    await addLyricsDialog.getByRole('button', { name: 'Archivo' }).click()

    // A realistic file: metadata tags, chords inside a line and a repeated mark.
    const lrcDropzone = addLyricsDialog.getByTestId('lrc-file-dropzone')
    await expect(lrcDropzone).toBeVisible()
    await lrcDropzone.locator('input[type="file"]').setInputFiles({
      name: 'practice.lrc',
      mimeType: 'text/plain',
      buffer: Buffer.from('[ti:Prueba]\n[ar:Banda]\n[00:12.00]Hola\n[00:15.50][Am]Dos\n[00:15.50]Dos otra vez'),
    })
    await expect(lrcDropzone).toContainText('practice.lrc')

    // Preview: assert the conversion the server returned.
    const [previewResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/lyrics/import-lrc')),
      addLyricsDialog.getByRole('button', { name: 'Revisar importación' }).click(),
    ])
    expect(previewResponse.ok()).toBeTruthy()
    const preview = await previewResponse.json()
    expect(preview.lyrics).toBe('Hola\n[Am]Dos\nDos otra vez')
    expect(preview.markCount).toBe(3)
    expect(preview.errors).toEqual([])
    await expect(addLyricsDialog.getByText(/3 marcas/)).toBeVisible()

    // Offset: the UI offset is ADDED to the marks (12000 + 1000 = 13000).
    await addLyricsDialog.getByLabel('Desfase (ms)').fill('1000')
    const [offsetResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/lyrics/import-lrc')),
      addLyricsDialog.getByRole('button', { name: 'Revisar importación' }).click(),
    ])
    const offsetPreview = await offsetResponse.json()
    expect(offsetPreview.chordTimingJson).toContain('"atMs":13000')

    // Applying updates the editor draft; the explicit save persists it.
    await addLyricsDialog.getByRole('button', { name: 'Añadir al borrador' }).click()
    await expect(addLyricsDialog).toBeHidden()

    const [patchResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/arrangements/') && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Guardar cambios' }).click(),
    ])
    expect(patchResponse.ok()).toBeTruthy()
    await expect(page.getByTestId('arrangement-editor')).toBeVisible()
    await page.getByRole('button', { name: 'Volver a editar' }).click()

    // The arrangement view provides Sonivo's lossless timed-lyrics export.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar TTML de Sonivo' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.ttml$/)

    // The native document retains timing and Sonivo metadata.
    const exported = readFileSync((await download.path())!, 'utf8')
    expect(exported).toContain('sonivo:version="1"')
  })
})
