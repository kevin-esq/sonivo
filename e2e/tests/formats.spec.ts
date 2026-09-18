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
