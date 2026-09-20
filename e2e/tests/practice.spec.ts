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
  addArrangementToSetlist,
  applySetlist,
  createEvent,
  createSetlist,
  eventPlanItem,
  openEvents,
  openSetlists,
  saveSetlistOrder,
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

  test('TC-PLAY-02 owner rehearses Event plan queue and advances to next item', async ({
    page,
  }) => {
    const stamp = Date.now()
    const email = uniqueEmail('play-queue')
    const groupName = `Queue Band ${stamp}`
    const songA = `Queue Song A ${stamp}`
    const songB = `Queue Song B ${stamp}`
    const arrA = `Queue Arr A ${stamp}`
    const arrB = `Queue Arr B ${stamp}`
    const lyricsA = `Letra cola A ${stamp}`
    const lyricsB = `Letra cola B ${stamp}`
    const setlistName = `Queue set ${stamp}`
    const eventTitle = `Queue event ${stamp}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)

    await createSong(page, songA)
    await openSong(page, songA)
    await createArrangement(page, arrA, { lyrics: lyricsA })
    await createFileResource(page, {
      label: `Audio A ${stamp}`,
      filePath: path.join(fixturesDir, 'practice-a.wav'),
      purpose: 'audio',
    })

    await page.getByRole('link', { name: groupName, exact: true }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await openLibrary(page)
    await createSong(page, songB)
    await openSong(page, songB)
    await createArrangement(page, arrB, { lyrics: lyricsB })

    await page.getByRole('link', { name: groupName, exact: true }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await openSetlists(page)
    await createSetlist(page, setlistName)
    await addArrangementToSetlist(page, `${songA} — ${arrA}`)
    await addArrangementToSetlist(page, `${songB} — ${arrB}`)
    await saveSetlistOrder(page)

    await openEvents(page)
    await createEvent(page, { title: eventTitle, startsAt: '2026-12-01T19:00' })
    await applySetlist(page)
    await expect(eventPlanItem(page, songA, arrA)).toBeVisible()
    await expect(eventPlanItem(page, songB, arrB)).toBeVisible()

    await page.getByTestId('ensayar-plan').click()
    await expect(page.getByTestId('practice-queue')).toBeVisible()
    await expect(page.getByTestId('practice-queue-song-title')).toHaveText(songA)
    await expect(page.getByTestId('practice-queue-arrangement-label')).toHaveText(arrA)
    await expect(page.getByRole('heading', { name: songA })).toBeVisible()
    await expect(page.getByTestId('practice-lyrics')).toContainText(lyricsA)
    await expect(page.getByTestId('practice-queue-prev')).toHaveAttribute('aria-disabled', 'true')

    await page.getByTestId('practice-queue-next').click()
    await expect(page.getByTestId('practice-queue-song-title')).toHaveText(songB)
    await expect(page.getByTestId('practice-queue-arrangement-label')).toHaveText(arrB)
    await expect(page.getByRole('heading', { name: songB })).toBeVisible()
    await expect(page.getByTestId('practice-lyrics')).toContainText(lyricsB)
    await expect(page.getByTestId('practice-queue-next')).toHaveAttribute('aria-disabled', 'true')
  })

  test('TC-PLAY-SYNC-01 owner sets timing marks and Practice highlights current line (Seguir letra)', async ({ page }) => {
    const stamp = Date.now()
    const email = uniqueEmail('play-sync')
    const groupName = `Sync Band ${stamp}`
    const songTitle = `Sync Song ${stamp}`
    const arrangementLabel = `Sync Arr ${stamp}`
    const lyricsLine1 = `Primera línea del verso ${stamp}`
    const lyricsLine2 = `Segunda línea del verso ${stamp}`
    const lyricsLine3 = `Tercera línea del verso ${stamp}`
    const allLyrics = `${lyricsLine1}\n${lyricsLine2}\n${lyricsLine3}`

    // Timing marks within the 3-second practice audio duration
    const mark1Ms = 500
    const mark2Ms = 1500
    const mark3Ms = 2500

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, { lyrics: allLyrics, chords: allLyrics })
    await createFileResource(page, {
      label: `Audio Sync ${stamp}`,
      filePath: path.join(fixturesDir, 'practice-a.wav'),
      purpose: 'audio',
    })

    // Go to Arrangement detail and open edit form
    // createArrangement already navigates to detail page
    await expect(page.getByRole('heading', { name: arrangementLabel })).toBeVisible()
    await page.getByRole('button', { name: 'Editar arreglo' }).click()
    await expect(page.getByRole('heading', { name: 'Editar arreglo' })).toBeVisible()

    // Wait for ChordTimingEditor to be visible (chords must be populated)
    await expect(page.getByTestId('chord-timing-editor')).toBeVisible({ timeout: 10_000 })

    // Verify chords field has content (3 lines)
    await expect(page.getByTestId('arrangement-chords')).toHaveValue(allLyrics)

    // Set timing marks for each line (in milliseconds) — within 3s audio duration
    await page.getByTestId('timing-line-0-ms').fill(String(mark1Ms))
    await page.getByTestId('timing-line-1-ms').fill(String(mark2Ms))
    await page.getByTestId('timing-line-2-ms').fill(String(mark3Ms))
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('heading', { name: arrangementLabel })).toBeVisible({ timeout: 10000 })

    // Re-open edit form to verify timing marks were saved
    await page.getByRole('button', { name: 'Editar arreglo' }).click()
    await expect(page.getByRole('heading', { name: 'Editar arreglo' })).toBeVisible()
    await expect(page.getByTestId('chord-timing-editor')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('timing-line-0-ms')).toHaveValue(String(mark1Ms))
    await expect(page.getByTestId('timing-line-1-ms')).toHaveValue(String(mark2Ms))
    await expect(page.getByTestId('timing-line-2-ms')).toHaveValue(String(mark3Ms))

    // Close edit form and open Practice page
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('heading', { name: arrangementLabel })).toBeVisible()

    // Open Practice page
    await page.getByRole('link', { name: 'Practicar' }).click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()

    // Wait for arrangement data to load (practice-lyrics for plain text, practice-chordpro for ChordPro)
    await expect(page.getByTestId('practice-lyrics')).toBeVisible({ timeout: 15_000 })

    // Verify "Seguir letra" toggle appears
    const followToggle = page.getByTestId('practice-follow-along')
    await expect(followToggle).toBeVisible()

    // Enable "Seguir letra"
    await followToggle.click()
    await expect(followToggle).toHaveAttribute('aria-pressed', 'true')

    // Start playback
    const playPause = page.getByTestId('practice-play-pause')
    await playPause.click()
    await expect(playPause).toHaveAttribute('aria-label', 'Pausar')

    // Wait for first highlight (line 0 at ~500ms)
    await expect
      .poll(async () => page.getByTestId('practice-lyrics').locator('[data-active-line="true"]').count(), { timeout: 15_000 })
      .toBe(1)

    // Verify first line is highlighted
    const chordPro = page.getByTestId('practice-lyrics')
    await expect(chordPro.locator('[data-line-index="0"][data-active-line="true"]')).toContainText('Primera línea')

    // Wait for second highlight (line 1 at ~1500ms)
    await expect
      .poll(async () => page.getByTestId('practice-lyrics').locator('[data-line-index="1"][data-active-line="true"]').count(), { timeout: 10_000 })
      .toBe(1)
    await expect(chordPro.locator('[data-line-index="1"][data-active-line="true"]')).toContainText('Segunda línea')

    // Wait for third highlight (line 2 at ~2500ms)
    await expect
      .poll(async () => page.getByTestId('practice-lyrics').locator('[data-line-index="2"][data-active-line="true"]').count(), { timeout: 10_000 })
      .toBe(1)
    await expect(chordPro.locator('[data-line-index="2"][data-active-line="true"]')).toContainText('Tercera línea')
  })
})
