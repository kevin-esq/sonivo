import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createGroup,
  createSong,
  openLibrary,
  openPractice,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

/**
 * Phase 4.5 — Stage mode. Requires the API to run with Features__StageMode=true
 * (`.scratch/HANDOFF.md` records the exact runner command). With the flag off the
 * second test asserts the product is unchanged (no trigger at all).
 */
test.describe('W19 stage mode', () => {
  test('owner opens stage mode, resizes type, controls scroll and exits with Escape', async ({
    page,
    request,
  }) => {
    const flags = await (await request.get('/api/features')).json()
    test.skip(!flags.stageMode, 'Features:StageMode is off')

    const email = uniqueEmail('w19stage')
    await register(page, email)
    await createGroup(page, `W19 ${Date.now()}`)

    await openLibrary(page)
    await createSong(page, 'Stage Song')
    await openSong(page, 'Stage Song')
    await createArrangement(page, 'En vivo', {
      lyrics: Array.from({ length: 40 }, (_, index) => `Línea de escenario ${index + 1}`).join('\n'),
    })
    await openPractice(page)

    // Trigger only exists when the server flag is on.
    const open = page.getByTestId('stage-open')
    await expect(open).toBeVisible()
    await open.click()

    const dialog = page.getByRole('dialog', { name: 'Modo escenario' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Línea de escenario 1')

    // Font size control (default 44, +4 / −4).
    const size = page.getByTestId('stage-font-size')
    await expect(size).toHaveText('44')
    await page.getByTestId('stage-font-up').click()
    await expect(size).toHaveText('48')
    await page.getByTestId('stage-font-down').click()
    await expect(size).toHaveText('44')

    // No timing marks in this arrangement → manual auto-scroll is offered.
    const scrollToggle = page.getByTestId('stage-scroll-toggle')
    await expect(scrollToggle).toBeVisible()
    await expect(scrollToggle).toHaveAttribute('aria-pressed', 'false')
    await scrollToggle.click()
    await expect(scrollToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(scrollToggle).toContainText('Pausar desplazamiento')

    // Line navigation keyboard/touch controls.
    await page.getByTestId('stage-next').click()
    await page.getByTestId('stage-prev').click()

    // Escape closes the overlay.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('with the flag off the stage trigger is absent', async ({ page, request }) => {
    const flags = await (await request.get('/api/features')).json()
    test.skip(flags.stageMode, 'Features:StageMode is on')

    const email = uniqueEmail('w19off')
    await register(page, email)
    await createGroup(page, `W19off ${Date.now()}`)

    await openLibrary(page)
    await createSong(page, 'Stage Off Song')
    await openSong(page, 'Stage Off Song')
    await createArrangement(page, 'En vivo', { lyrics: 'Sin escenario' })
    await openPractice(page)

    await expect(page.getByTestId('stage-open')).toHaveCount(0)
  })
})
