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

    // The panel only renders when the server flag is on.
    await expect(page.getByRole('heading', { name: 'Importar .lrc' })).toBeVisible()

    const textarea = page.getByLabel('Contenido .lrc')
    await textarea.fill('[00:12.00]Hola\n[00:15.50]Dos')

    // Preview: assert the conversion the server returned.
    const [previewResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/lyrics/import-lrc')),
      page.getByRole('button', { name: 'Previsualizar' }).click(),
    ])
    expect(previewResponse.ok()).toBeTruthy()
    const preview = await previewResponse.json()
    expect(preview.lyrics).toBe('Hola\nDos')
    expect(preview.markCount).toBe(2)
    await expect(page.getByText(/2 marcas/)).toBeVisible()

    // Offset: the UI offset is ADDED to the marks (12000 + 1000 = 13000).
    await page.getByLabel('Desfase (ms)').fill('1000')
    const [offsetResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/lyrics/import-lrc')),
      page.getByRole('button', { name: 'Previsualizar' }).click(),
    ])
    const offsetPreview = await offsetResponse.json()
    expect(offsetPreview.chordTimingJson).toContain('"atMs":13000')

    // Apply persists through the normal versioned PATCH.
    const [patchResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/arrangements/') && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Aplicar a la letra' }).click(),
    ])
    expect(patchResponse.ok()).toBeTruthy()
    await expect(page.getByRole('button', { name: 'Aplicar a la letra' })).toBeHidden()

    // Export downloads a .lrc file containing the timestamps.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar .lrc' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.lrc$/)
  })
})
