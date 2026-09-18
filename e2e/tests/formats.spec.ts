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

test.describe('ChordPro formats (Wave 1)', () => {
  test('TC-FMT-01 owner sets ChordPro chords then Practicar shows chord and lyric', async ({
    page,
  }) => {
    const email = uniqueEmail('fmt-owner')
    const groupName = `Fmt Band ${Date.now()}`
    const songTitle = `Fmt Song ${Date.now()}`
    const arrangementLabel = `Fmt Arr ${Date.now()}`
    const lyricWord = `verso${Date.now()}`
    const chordToken = 'Am'
    const chordProBody = `[${chordToken}]${lyricWord} [G]la`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel)

    await page.getByRole('button', { name: 'Editar arreglo' }).click()
    await expect(page.getByRole('heading', { name: 'Editar arreglo' })).toBeVisible()
    await page.getByTestId('arrangement-chords').fill(chordProBody)
    await expect(page.getByTestId('chords-preview')).toBeVisible()
    await expect(page.getByTestId('chords-preview')).toContainText(chordToken)
    await expect(page.getByTestId('chords-preview')).toContainText(lyricWord)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('button', { name: 'Editar arreglo' })).toBeVisible()

    await openPractice(page)

    const chordProView = page.getByTestId('practice-chordpro')
    await expect(chordProView).toBeVisible()
    await expect(chordProView).toContainText(chordToken)
    await expect(chordProView).toContainText(lyricWord)
  })
})

test.describe('ChordPro transpose + views (ADR-0030 P0)', () => {
  test('TC-C30-01 ChordPro [Am] → Practicar → +1 shows A#m', async ({ page }) => {
    const email = uniqueEmail('c30-transpose')
    const groupName = `C30 Band ${Date.now()}`
    const songTitle = `C30 Song ${Date.now()}`
    const arrangementLabel = `C30 Arr ${Date.now()}`
    const lyricWord = `verso${Date.now()}`
    const chordProBody = `[Am]${lyricWord}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel)

    await page.getByRole('button', { name: 'Editar arreglo' }).click()
    await expect(page.getByRole('heading', { name: 'Editar arreglo' })).toBeVisible()
    await page.getByTestId('arrangement-chords').fill(chordProBody)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('button', { name: 'Editar arreglo' })).toBeVisible()

    await openPractice(page)

    const chordProView = page.getByTestId('practice-chordpro')
    await expect(chordProView).toBeVisible()
    await expect(chordProView).toContainText('Am')
    await expect(chordProView).toContainText(lyricWord)

    await expect(page.getByTestId('practice-transpose-up')).toBeVisible()
    await page.getByTestId('practice-transpose-up').click()
    await expect(page.getByTestId('practice-transpose-offset')).toContainText('+1')
    // Sharp-preferring convention: Am +1 → A#m (not Bbm)
    await expect(chordProView.locator('[data-chord="A#m"]')).toBeVisible()
    await expect(chordProView.locator('[data-chord="Am"]')).toHaveCount(0)
    await expect(chordProView).toContainText(lyricWord)
  })
})

test.describe('ChordPro text digitizer (ADR-0030 P1)', () => {
  test('TC-C30-02 digitizer generates ChordPro then Practicar shows chord and lyric', async ({
    page,
  }) => {
    const email = uniqueEmail('c30-digitizer')
    const groupName = `Dig Band ${Date.now()}`
    const songTitle = `Dig Song ${Date.now()}`
    const arrangementLabel = `Dig Arr ${Date.now()}`
    const lyricWord = `verso${Date.now()}`
    const chordToken = 'Am'

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel)

    await page.getByRole('button', { name: 'Editar arreglo' }).click()
    await expect(page.getByRole('heading', { name: 'Editar arreglo' })).toBeVisible()
    await expect(page.getByTestId('chordpro-digitizer')).toBeVisible()
    await page.getByTestId('digitizer-lyrics').fill(`${lyricWord} la`)
    await page.getByTestId('digitizer-chords').fill(`${chordToken} G`)
    await page.getByTestId('digitizer-generate').click()
    await expect(page.getByTestId('arrangement-chords')).toContainText(`[${chordToken}]`)
    await expect(page.getByTestId('arrangement-chords')).toContainText(lyricWord)
    await expect(page.getByTestId('digitizer-studio')).toBeVisible()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('button', { name: 'Editar arreglo' })).toBeVisible()

    await openPractice(page)
    const chordProView = page.getByTestId('practice-chordpro')
    await expect(chordProView).toBeVisible()
    await expect(chordProView).toContainText(chordToken)
    await expect(chordProView).toContainText(lyricWord)
  })
})
