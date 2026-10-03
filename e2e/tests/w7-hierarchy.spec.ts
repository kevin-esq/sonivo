import { expect, test } from '@playwright/test'
import {
  addArrangementToSetlist,
  createArrangement,
  createGroup,
  createSetlist,
  createSong,
  openLibrary,
  openSetlists,
  openSong,
  register,
  saveSetlistOrder,
  uniqueEmail,
} from './helpers'

test.describe('W7 hierarchy: one header per screen', () => {
  test('single gradient header, aligned bar/card, deduped counts, plural, rename from Ajustes', async ({
    page,
  }) => {
    const email = uniqueEmail('w7-hierarchy')
    const stamp = Date.now()
    const groupName = `W7 Band ${stamp}`
    const renamedGroup = `W7 Renamed ${stamp}`
    const songTitle = `W7 Tune ${stamp}`
    const arrangementLabel = `W7 Key ${stamp}`
    const setlistName = `W7 Set ${stamp}`
    const planLine = `${songTitle} — ${arrangementLabel}`

    await register(page, email)
    await createGroup(page, groupName)

    // 6. Group home no longer renders the greeting block.
    await expect(page.getByText(/¡Hola,/)).toHaveCount(0)

    await openLibrary(page)
    await expect(page.getByTestId('library-hero')).toBeVisible()

    // 1. Exactly one gradient surface among the top-level headers: the group bar.
    const gradientTestIds = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="grupo-shell"]')
      if (!shell) return [] as string[]
      return Array.from(shell.querySelectorAll<HTMLElement>('*'))
        .filter((el) => {
          const image = getComputedStyle(el).backgroundImage
          return Boolean(image) && image !== 'none' && image.includes('gradient')
        })
        .map((el) => el.getAttribute('data-testid') ?? el.tagName.toLowerCase())
    })
    expect(gradientTestIds).toEqual(['group-bar'])

    // The page header itself must not carry a gradient.
    const heroBackground = await page
      .getByTestId('library-hero')
      .evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(heroBackground).toBe('none')

    // 2. Group bar and content card share identical left/right bounds (>= 768px).
    const bar = await page.getByTestId('group-bar').boundingBox()
    const card = await page.getByTestId('group-content').boundingBox()
    expect(bar, 'group bar is measurable').not.toBeNull()
    expect(card, 'content card is measurable').not.toBeNull()
    expect(Math.abs(bar!.x - card!.x), 'left edges align').toBeLessThanOrEqual(1)
    expect(
      Math.abs(bar!.x + bar!.width - (card!.x + card!.width)),
      'right edges align',
    ).toBeLessThanOrEqual(1)

    // 3. Song detail: the readiness count appears exactly once (facts sidebar no longer repeats it).
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await expect(page.getByTestId('song-readiness')).toContainText('Sin arreglo')
    await createArrangement(page, arrangementLabel)
    await page.getByRole('link', { name: songTitle }).first().click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()
    await expect(page.getByTestId('song-readiness')).toContainText('1 arreglo')
    await expect(page.getByText('1 arreglo', { exact: true })).toHaveCount(1)

    // 4. Plural: a setlist with one arrangement reads "1 arreglo", never "1 arreglos".
    await openSetlists(page)
    await createSetlist(page, setlistName)
    await addArrangementToSetlist(page, planLine)
    await saveSetlistOrder(page)
    await expect(page.getByTestId('setlist-status-chip')).toContainText('1 arreglo')
    await expect(page.getByText('1 arreglos')).toHaveCount(0)

    // 5. Rename from Ajustes del grupo flows into the group bar.
    await page.getByRole('link', { name: 'Ajustes del grupo' }).first().click()
    await expect(page.getByRole('heading', { name: 'Ajustes del grupo' })).toBeVisible()
    await page.getByTestId('group-name-input').fill(renamedGroup)
    await page.getByRole('button', { name: 'Guardar nombre' }).click()
    await expect(page.getByTestId('group-bar')).toContainText(renamedGroup)
  })
})
