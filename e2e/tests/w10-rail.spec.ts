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

test.describe('W10 rail: scroll, collapse, now playing', () => {
  test('rail scrolls independently of a long page', async ({ page }) => {
    const stamp = Date.now()
    const email = uniqueEmail('w10-scroll')
    await register(page, email)
    await createGroup(page, `W10 Scroll ${stamp}`)

    await openLibrary(page)
    for (let i = 0; i < 8; i += 1) {
      await createSong(page, `W10 Song ${i} ${stamp}`)
    }
    await expect(page.getByRole('heading', { name: 'Canciones' })).toBeVisible()

    // A short viewport guarantees the content region overflows.
    await page.setViewportSize({ width: 1280, height: 480 })

    const rail = page.getByTestId('group-rail')
    const scroller = page.getByTestId('group-content-scroll')
    const before = await rail.boundingBox()
    expect(before, 'rail is measurable').not.toBeNull()

    const scrolled = await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight
      return el.scrollTop
    })
    expect(scrolled, 'content region actually scrolled').toBeGreaterThan(0)

    const after = await rail.boundingBox()
    expect(after, 'rail is still measurable').not.toBeNull()
    expect(Math.abs(after!.y - before!.y), 'rail top unchanged').toBeLessThanOrEqual(1)

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    expect(after!.y, 'rail top inside viewport').toBeGreaterThanOrEqual(-1)
    expect(
      after!.y + after!.height,
      'rail fully within the viewport',
    ).toBeLessThanOrEqual(viewport!.height + 1)
  })

  test('rail collapses, persists across reload, and nav stays reachable', async ({ page }) => {
    const email = uniqueEmail('w10-collapse')
    await register(page, email)
    await createGroup(page, `W10 Collapse ${Date.now()}`)

    const rail = page.getByTestId('group-rail')
    const toggle = page.getByTestId('rail-collapse-toggle')
    const expanded = await rail.boundingBox()
    expect(expanded, 'rail is measurable').not.toBeNull()

    await expect(toggle).toHaveAccessibleName('Contraer menú lateral')
    await toggle.click()
    // The collapsed rail expands temporarily while hovered. Move away so the
    // persisted collapsed state is what the next assertions observe.
    await page.mouse.move(500, 300)
    await expect(toggle).toHaveAccessibleName('Expandir menú lateral')
    await expect
      .poll(async () => (await rail.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(expanded!.width - 60)

    await page.reload()
    await page.mouse.move(500, 300)
    await expect(page.getByTestId('rail-collapse-toggle')).toHaveAccessibleName(
      'Expandir menú lateral',
    )
    const stored = await page.evaluate(() => window.localStorage.getItem('sonivo:sidebar'))
    expect(stored).toBe('collapsed')

    // The same link is still reachable by its accessible name and navigates.
    await page.getByTestId('group-rail').getByRole('link', { name: 'Canciones' }).click()
    await expect(page.getByRole('heading', { name: 'Canciones' })).toBeVisible()
  })

  test('global player appears only on repertoire playback surfaces', async ({ page }) => {
    test.setTimeout(180_000)
    const stamp = Date.now()
    const trackLabel = `W10 Pista ${stamp}`
    const songTitle = `W10 Playing Song ${stamp}`
    const email = uniqueEmail('w10-playing')
    await register(page, email)
    await createGroup(page, `W10 Playing ${stamp}`)

    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, `W10 Arr ${stamp}`)
    await createFileResource(page, {
      label: trackLabel,
      filePath: path.join(fixturesDir, 'practice-a.wav'),
      purpose: 'audio',
    })

    await openPractice(page)
    const player = page.getByTestId('global-player')
    const playPause = player.getByRole('button', { name: 'Reproducir' })
    await playPause.click()
    await expect(player.getByRole('button', { name: 'Pausar' })).toBeVisible()
    await expect(player.getByRole('button', { name: 'Contraer reproductor' })).toHaveCount(0)
    await expect(player.getByRole('button', { name: 'Cerrar reproductor' })).toHaveCount(0)
    await expect(player.getByRole('slider', { name: 'Progreso de reproducción de audio' })).toBeVisible()
    await player.screenshot({ path: '../output/playwright/player-desktop-capsule.png', animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' })

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(player.getByText(trackLabel, { exact: true })).toBeVisible()
      const bounds = await player.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if (width === 390) {
        await player.screenshot({ path: '../output/playwright/player-mobile-capsule.png', animations: 'disabled', style: 'nextjs-portal { visibility: hidden; }' })
      }
    }
    await page.setViewportSize({ width: 1280, height: 844 })
    const volume = player.getByRole('slider', { name: 'Volumen' })
    await volume.evaluate((el) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '0.35')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect.poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.volume)).toBeCloseTo(0.35)
    await player.getByRole('button', { name: 'Retroceder 10 segundos', exact: true }).click()
    await expect(player.getByRole('slider', { name: 'Progreso de reproducción de audio' }).filter({ visible: true })).toHaveValue('0')
    await player.getByRole('button', { name: 'Adelantar 10 segundos', exact: true }).click()
    await expect.poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeCloseTo(3)

    const home = page.getByTestId('group-rail').getByRole('link', { name: 'Inicio', exact: true })
    const groupPath = (await home.getAttribute('href'))!
    await home.click()
    await expect(page).toHaveURL(groupPath, { timeout: 30_000 })
    await expect(player).toHaveCount(0)
  })

  test('mobile uses the top navigation and hides the desktop rail', async ({ page }) => {
    const email = uniqueEmail('w10-mobile')
    await register(page, email)
    await createGroup(page, `W10 Movil ${Date.now()}`)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('mobile-section-nav')).toBeVisible()
    await expect(page.getByTestId('mobile-tabbar')).toHaveCount(0)
    await expect(page.getByTestId('group-rail')).not.toBeVisible()
  })
})
