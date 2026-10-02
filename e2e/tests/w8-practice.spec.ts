import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createEvent,
  createGroup,
  createSong,
  openEvents,
  openLibrary,
  openPractice,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

/**
 * W8 P2 — practice honesty + destructive separation.
 * ChordPro directives must not leak into the rendered lyrics; the Avanzado tab
 * must state exactly what it offers; destructive actions live in their own zone.
 */
test.describe('W8 practice + destructive affordances', () => {
  test('directives are consumed, Avanzado is honest, danger zones are separated', async ({
    page,
  }) => {
    const stamp = Date.now()
    const email = uniqueEmail('w8-practice')
    const groupName = `W8 Band ${stamp}`
    const songTitle = `W8 Song ${stamp}`
    const arrangementLabel = `W8 Arr ${stamp}`
    const lyricWord = `palabra${stamp}`
    const chorusWord = `estribillo${stamp}`
    const eventTitle = `W8 Event ${stamp}`
    const chordProBody = [
      `{title: W8 Título}`,
      '{start_of_verse}',
      `[C]${lyricWord} la la`,
      '{end_of_verse}',
      '{start_of_chorus}',
      `[G]${chorusWord} oh oh`,
      '{end_of_chorus}',
    ].join('\n')

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, { chords: chordProBody })

    // Practicar renders chords above lyrics and never leaks raw directives.
    // With a ChordPro body the lyrics surface is `practice-chordpro`
    // (`practice-lyrics` is the plain-text fallback rendered only without chords).
    await openPractice(page)
    const chordProView = page.getByTestId('practice-chordpro')
    await expect(chordProView).toBeVisible()
    await expect(chordProView).toContainText(lyricWord)
    await expect(chordProView.locator('[data-chord="C"]')).toBeVisible()
    await expect(chordProView).not.toContainText('{title')
    await expect(chordProView).not.toContainText('TÍTULO:')
    await expect(chordProView).not.toContainText('{start_of_chorus}')
    await expect(chordProView).not.toContainText('{start_of_verse}')
    // The chorus opener renders as a single, subtle section label.
    await expect(page.getByText('Coro', { exact: true })).toHaveCount(1)

    // Avanzado offers working entry points; the digitizer section explains the
    // missing audio resource instead of rendering nothing.
    await page.getByTestId('practice-tab-avanzado').click()
    await expect(page.getByTestId('practice-advanced-timing-link')).toBeVisible()
    await expect(page.getByTestId('practice-advanced-digitize-link')).toBeVisible()
    await expect(page.getByTestId('practice-advanced-digitize-empty')).toBeVisible()
    await expect(page.getByTestId('audio-digitizer')).toHaveCount(0)

    // Song detail: the danger zone owns the delete; the facts sidebar does not.
    await page
      .getByRole('navigation', { name: 'Ruta' })
      .getByRole('link', { name: songTitle })
      .click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()
    const songDanger = page.getByTestId('danger-zone')
    await expect(songDanger).toBeVisible()
    await expect(songDanger.getByRole('button', { name: 'Eliminar canción' })).toBeVisible()
    await expect(
      page.getByTestId('song-facts').getByRole('button', { name: 'Eliminar canción' }),
    ).toHaveCount(0)
    // Exactly one page-level button keeps the deleteSong helper strict-mode safe.
    await expect(page.getByRole('button', { name: 'Eliminar canción' })).toHaveCount(1)

    // Event detail: the danger zone owns the cancel; the hero does not.
    await openEvents(page)
    await createEvent(page, { title: eventTitle, startsAt: '2026-12-20T19:00' })
    const eventDanger = page.getByTestId('danger-zone')
    await expect(eventDanger).toBeVisible()
    await expect(eventDanger.getByRole('button', { name: 'Cancelar evento' })).toBeVisible()
    await expect(
      page.getByTestId('event-hero').getByRole('button', { name: 'Cancelar evento' }),
    ).toHaveCount(0)
    await expect(
      page.getByTestId('event-hero').getByRole('button', { name: 'Editar evento' }),
    ).toBeVisible()
  })
})
