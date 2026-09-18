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
})
