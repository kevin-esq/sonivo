import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createFileResource,
  createGroup,
  createSong,
  openLibrary,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

/**
 * TC-WSP-01 (ADR-0032 T-W32-03): Whisper audio digitizer thin, mechanics only.
 * Real `tiny` model on a Spanish speech fixture (practice-a.wav tones yield
 * zero segments through this pipeline — verified); asserts the job pipeline
 * (done → review renders → apply → Practice "Seguir letra" toggle appears),
 * never transcript quality. No fixed sleeps — polling with generous timeouts
 * for first-run model download.
 */
test.describe('Audio digitizer thin (Whisper)', () => {
  test('TC-WSP-01 owner digitizes audio, applies marks, and Practice offers Seguir letra', async ({
    page,
  }) => {
    test.setTimeout(480_000)

    const stamp = Date.now()
    const email = uniqueEmail('wsp-owner')
    const groupName = `WSP Band ${stamp}`
    const songTitle = `WSP Song ${stamp}`
    const arrangementLabel = `WSP Arr ${stamp}`
    const chordProBody = `[Am]Línea uno ${stamp}\n[G]Línea dos ${stamp}\n[C]Línea tres ${stamp}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, { chords: chordProBody })
    await createFileResource(page, {
      label: `Maqueta ${stamp}`,
      filePath: path.join(fixturesDir, 'practice-speech.wav'),
      purpose: 'audio',
    })

    // Owner-only digitizer surface is visible; members never see drafts (server is Owner-only too).
    await expect(page.getByTestId('audio-digitizer')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Digitalizar audio' })).toBeVisible()

    await page.getByTestId('digitize-start').click()

    // Job runs async (first run downloads the tiny model): poll, don't sleep.
    await expect(page.getByTestId('digitize-segments')).toBeVisible({ timeout: 300_000 })
    await expect(page.getByRole('heading', { name: 'Revisar borrador' })).toBeVisible()

    // Default line assignment follows segment order; keep it and apply.
    await expect(page.getByTestId('digitize-segment-0-line')).toHaveValue('0')

    await page.getByTestId('digitize-apply-marks').click()
    await expect(page.getByTestId('digitize-success')).toBeVisible({ timeout: 30_000 })

    // Saved marks flow into the existing follow-along path (ADR-0031).
    await page.getByRole('link', { name: 'Practicar' }).click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()
    await expect(page.getByTestId('practice-chordpro')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('practice-follow-along')).toBeVisible()
  })
})
