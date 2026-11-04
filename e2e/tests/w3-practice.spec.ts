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

test.describe('W3 Practice progressive disclosure', () => {
  test('default Estudiar tab shows lyrics; Avanzado reveals entries; Afinar renders tuner; ?tab deep-link works', async ({
    page,
  }) => {
    const stamp = Date.now()
    const email = uniqueEmail('w3-practice')
    const groupName = `W3 Band ${stamp}`
    const songTitle = `W3 Song ${stamp}`
    const arrangementLabel = `W3 Arr ${stamp}`
    const lyricsLine = `Verso w3 ${stamp} — la la la`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, { lyrics: lyricsLine })
    await openPractice(page)

    const baseUrl = page.url()
    // Default tab is Estudiar with lyrics visible.
    const estudiarTab = page.getByTestId('practice-tab-estudiar')
    await expect(estudiarTab).toBeVisible()
    await expect(estudiarTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('practice-tab-avanzado')).toHaveAttribute(
      'aria-selected',
      'false',
    )
    await expect(page.getByTestId('practice-tab-afinar')).toHaveAttribute(
      'aria-selected',
      'false',
    )
    await expect(page.getByTestId('practice-lyrics')).toContainText(lyricsLine)

    // Avanzado reveals timing and digitizer entry points. Conductor needs an Event.
    await page.getByTestId('practice-tab-avanzado').click()
    await expect(page.getByTestId('practice-tab-avanzado')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByTestId('practice-advanced-timing-link')).toBeVisible()
    await expect(page.getByTestId('practice-advanced-digitize-link')).toBeVisible()
    await expect(page.getByTestId('practice-advanced-conductor-hint')).toHaveCount(0)
    await expect(page).toHaveURL(/tab=avanzado/)

    // Afinar renders the tuner.
    await page.getByTestId('practice-tab-afinar').click()
    await expect(page.getByTestId('practice-tab-afinar')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByTestId('tuner-toggle')).toBeVisible()
    await expect(page.getByTestId('tuner-panel')).toBeVisible()

    // ?tab=avanzado deep-link lands directly on Avanzado.
    const advancedUrl = new URL(baseUrl)
    advancedUrl.searchParams.set('tab', 'avanzado')
    await page.goto(advancedUrl.toString())
    await expect(page.getByTestId('practice-tab-avanzado')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByTestId('practice-advanced-timing-link')).toBeVisible()

    // Unknown tab values fall back to Estudiar.
    const unknownTabUrl = new URL(baseUrl)
    unknownTabUrl.searchParams.set('tab', 'curioso')
    await page.goto(unknownTabUrl.toString())
    await expect(page.getByTestId('practice-tab-estudiar')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByTestId('practice-lyrics')).toContainText(lyricsLine)
  })
})
