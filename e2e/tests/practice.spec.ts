import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createFileResource,
  createGroup,
  createSong,
  openLibrary,
  openPractice,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

test.describe('Practice / karaoke thin', () => {
  test('TC-PRACTICE-01 owner opens Practicar and sees lyrics', async ({ page }) => {
    const email = uniqueEmail('practice-owner')
    const groupName = `Practice Band ${Date.now()}`
    const songTitle = `Practice Song ${Date.now()}`
    const arrangementLabel = `Practice Arr ${Date.now()}`
    const lyricsLine = `Verso único ${Date.now()} — la la la`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, {
      lyrics: lyricsLine,
      defaultKey: 'G',
      defaultBpm: '120',
    })

    await openPractice(page)

    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()
    await expect(page.getByRole('paragraph').filter({ hasText: arrangementLabel })).toBeVisible()
    await expect(page.getByText('Tonalidad: G')).toBeVisible()
    await expect(page.getByText('Tempo: 120 BPM')).toBeVisible()
    await expect(page.getByTestId('practice-lyrics')).toContainText(lyricsLine)
  })

  test('TC-PLAY-01 owner plays, seeks, and changes practice track', async ({ page }) => {
    const email = uniqueEmail('play-owner')
    const groupName = `Player Band ${Date.now()}`
    const songTitle = `Player Song ${Date.now()}`
    const arrangementLabel = `Player Arr ${Date.now()}`
    const lyricsLine = `Letra player ${Date.now()}`
    const trackA = `Pista A ${Date.now()}`
    const trackB = `Pista B ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, { lyrics: lyricsLine })
    await createFileResource(page, {
      label: trackA,
      filePath: path.join(fixturesDir, 'practice-a.wav'),
      purpose: 'audio',
    })
    await createFileResource(page, {
      label: trackB,
      filePath: path.join(fixturesDir, 'practice-b.wav'),
      purpose: 'audio',
    })

    await openPractice(page)

    const player = page.getByTestId('practice-player')
    await expect(player).toBeVisible()
    await expect(page.getByTestId('practice-lyrics')).toContainText(lyricsLine)

    const trackSelect = page.getByTestId('practice-track-select')
    await expect(trackSelect).toBeVisible()
    await expect(trackSelect.locator('option')).toHaveCount(2)
    await expect(trackSelect).toHaveValue(/.+/)
    const firstTrackId = await trackSelect.inputValue()

    await expect(page.getByTestId('practice-duration')).not.toHaveText('0:00', { timeout: 15_000 })

    const playPause = page.getByTestId('practice-play-pause')
    await playPause.click()
    await expect(playPause).toHaveAttribute('aria-label', 'Pausar')

    await expect
      .poll(async () => page.getByTestId('practice-current-time').innerText(), { timeout: 10_000 })
      .not.toBe('0:00')

    await playPause.click()
    await expect(playPause).toHaveAttribute('aria-label', 'Reproducir')

    const seek = page.getByTestId('practice-seek')
    await seek.evaluate((el) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '1.5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect
      .poll(async () => page.getByTestId('practice-current-time').innerText())
      .toMatch(/^0:0[12]$/)

    const volume = page.getByTestId('practice-volume')
    await volume.evaluate((el) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '0.4')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(volume).toHaveValue('0.4')

    await trackSelect.selectOption({ label: trackB })
    await expect(trackSelect).not.toHaveValue(firstTrackId)
    await expect(page.getByTestId('practice-current-time')).toHaveText('0:00')
    await expect(playPause).toHaveAttribute('aria-label', 'Reproducir')
  })
})
